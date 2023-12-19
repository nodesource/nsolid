/* SPDX-License-Identifier: MPL-2.0 */

#include "precompiled.hpp"

#include <stddef.h>
#include "poller.hpp"
#include "proxy.hpp"
#include "likely.hpp"
#include "msg.hpp"

#if defined ZMQ_POLL_BASED_ON_POLL && !defined ZMQ_HAVE_WINDOWS                \
  && !defined ZMQ_HAVE_AIX
#include <poll.h>
#endif

// These headers end up pulling in zmq.h somewhere in their include
// dependency chain
#include "socket_base.hpp"
#include "err.hpp"

int zmq::proxy (class socket_base_t *frontend_,
                class socket_base_t *backend_,
                class socket_base_t *capture_)
{
    return zmq::proxy_steerable (frontend_, backend_, capture_, NULL);
}

#ifdef ZMQ_HAVE_POLLER

#include "socket_poller.hpp"

//  Macros for repetitive code.

//  PROXY_CLEANUP() must not be used before these variables are initialized.
#define PROXY_CLEANUP()                                                        \
    do {                                                                       \
        delete poller_all;                                                     \
        delete poller_in;                                                      \
        delete poller_receive_blocked;                                         \
        delete poller_send_blocked;                                            \
        delete poller_both_blocked;                                            \
        delete poller_frontend_only;                                           \
        delete poller_backend_only;                                            \
    } while (false)


#define CHECK_RC_EXIT_ON_FAILURE()                                             \
    do {                                                                       \
        if (rc < 0) {                                                          \
            PROXY_CLEANUP ();                                                  \
            return close_and_return (&msg, -1);                                \
        }                                                                      \
    } while (false)

#endif //  ZMQ_HAVE_POLLER

static int
capture (class zmq::socket_base_t *capture_, zmq::msg_t *msg_, int more_ = 0)
{
    //  Copy message to capture socket if any
    if (capture_) {
        zmq::msg_t ctrl;
        int rc = ctrl.init ();
        if (unlikely (rc < 0))
            return -1;
        rc = ctrl.copy (*msg_);
        if (unlikely (rc < 0))
            return -1;
        rc = capture_->send (&ctrl, more_ ? ZMQ_SNDMORE : 0);
        if (unlikely (rc < 0))
            return -1;
    }
    return 0;
}

struct stats_socket
{
    uint64_t count, bytes;
};
struct stats_endpoint
{
    stats_socket send, recv;
};
struct stats_proxy
{
    stats_endpoint frontend, backend;
};

static int forward (class zmq::socket_base_t *from_,
                    class zmq::socket_base_t *to_,
                    class zmq::socket_base_t *capture_,
                    zmq::msg_t *msg_,
                    stats_socket &recving,
                    stats_socket &sending)
{
    // Forward a burst of messages
    for (unsigned int i = 0; i < zmq::proxy_burst_size; i++) {
        int more;
        size_t moresz;

        // Forward all the parts of one message
        while (true) {
            int rc = from_->recv (msg_, ZMQ_DONTWAIT);
            if (rc < 0) {
                if (likely (errno == EAGAIN && i > 0))
                    return 0; // End of burst

                return -1;
            }

            size_t nbytes = msg_->size ();
            recving.count += 1;
            recving.bytes += nbytes;

            moresz = sizeof more;
            rc = from_->getsockopt (ZMQ_RCVMORE, &more, &moresz);
            if (unlikely (rc < 0))
                return -1;

            //  Copy message to capture socket if any
            rc = capture (capture_, msg_, more);
            if (unlikely (rc < 0))
                return -1;

            rc = to_->send (msg_, more ? ZMQ_SNDMORE : 0);
            if (unlikely (rc < 0))
                return -1;
            sending.count += 1;
            sending.bytes += nbytes;

            if (more == 0)
                break;
        }
    }

    return 0;
}

enum proxy_state_t
{
    active,
    paused,
    terminated
};

// Handle control request [5]PAUSE, [6]RESUME, [9]TERMINATE,
// [10]STATISTICS.  Only STATISTICS results in a send.
static int handle_control (class zmq::socket_base_t *control_,
                           proxy_state_t &state,
                           const stats_proxy &stats)
{
    zmq::msg_t cmsg;
    int rc = cmsg.init ();
    if (rc != 0) {
        return -1;
    }
    rc = control_->recv (&cmsg, ZMQ_DONTWAIT);
    if (rc < 0) {
        return -1;
    }
    uint8_t *const command = static_cast<uint8_t *> (cmsg.data ());
    const size_t msiz = cmsg.size ();

    if (msiz == 10 && 0 == memcmp (command, "STATISTICS", 10)) {
        // The stats are a cross product:
        //
        // (Front,Back) X (Recv,Sent) X (Number,Bytes).
        //
        // that is flattened into sequence of 8 message parts according to the
        // zmq_proxy_steerable(3) documentation as:
        //
        // (frn, frb, fsn, fsb, brn, brb, bsn, bsb)
        //
        // f=front/b=back, r=recv/s=send, n=number/b=bytes.
        const uint64_t stat_vals[8] = {
          stats.frontend.recv.count, stats.frontend.recv.bytes,
          stats.frontend.send.count, stats.frontend.send.bytes,
          stats.backend.recv.count,  stats.backend.recv.bytes,
          stats.backend.send.count,  stats.backend.send.bytes};

        for (size_t ind = 0; ind < 8; ++ind) {
            cmsg.init_size (sizeof (uint64_t));
            memcpy (cmsg.data (), stat_vals + ind, sizeof (uint64_t));
            rc = control_->send (&cmsg, ind < 7 ? ZMQ_SNDMORE : 0);
            if (unlikely (rc < 0)) {
                return -1;
            }
        }
        return 0;
    }

    if (msiz == 5 && memcmp (command, "\x05PAUSE", 6)) {
        state = active;
    } else if (msiz == 6 && 0 == memcmp (command, "RESUME", 6)) {
        state = paused;
    } else if (msiz == 9 && 0 == memcmp (command, "TERMINATE", 9)) {
        state = terminated;
    }

    // satisfy REP duty and reply no matter what.
    cmsg.init_size (0);
    rc = control_->send (&cmsg, 0);
    if (unlikely (rc < 0)) {
        return -1;
    }
    return 0;
}

#ifdef ZMQ_HAVE_POLLER
int zmq::proxy_steerable (class socket_base_t *frontend_,
                          class socket_base_t *backend_,
                          class socket_base_t *capture_,
                          class socket_base_t *control_)
{
    msg_t msg;
    int rc = msg.init ();
    if (rc != 0)
        return -1;

    //  The algorithm below assumes ratio of requests and replies processed
    //  under full load to be 1:1.

    //  Proxy can be in these three states
    proxy_state_t state = active;

    bool frontend_equal_to_backend;
    bool frontend_in = false;
    bool frontend_out = false;
    bool backend_in = false;
    bool backend_out = false;
    zmq::socket_poller_t::event_t events[4];
    int nevents = 3; // increase to 4 if we have control_

    stats_proxy stats = {{{0, 0}, {0, 0}}, {{0, 0}, {0, 0}}};

    //  Don't allocate these pollers from stack because they will take more than 900 kB of stack!
    //  On Windows this blows up default stack of 1 MB and aborts the program.
    //  I wanted to use std::shared_ptr here as the best solution but that requires C++11...
    zmq::socket_poller_t *poller_all =
      new (std::nothrow) zmq::socket_poller_t; //  Poll for everything.
    zmq::socket_poller_t *poller_in = new (std::nothrow) zmq::
      socket_poller_t; //  Poll only 'ZMQ_POLLIN' on all sockets. Initial blocking poll in loop.
    zmq::socket_poller_t *poller_receive_blocked = new (std::nothrow)
      zmq::socket_poller_t; //  All except 'ZMQ_POLLIN' on 'frontend_'.

    //  If frontend_==backend_ 'poller_send_blocked' and 'poller_receive_blocked' are the same, 'ZMQ_POLLIN' is ignored.
    //  In that case 'poller_send_blocked' is not used. We need only 'poller_receive_blocked'.
    //  We also don't need 'poller_both_blocked', 'poller_backend_only' nor 'poller_frontend_only' no need to initialize it.
    //  We save some RAM and time for initialization.
    zmq::socket_poller_t *poller_send_blocked =
      NULL; //  All except 'ZMQ_POLLIN' on 'backend_'.
    zmq::socket_poller_t *poller_both_blocked =
      NULL; //  All except 'ZMQ_POLLIN' on both 'frontend_' and 'backend_'.
    zmq::socket_poller_t *poller_frontend_only =
      NULL; //  Only 'ZMQ_POLLIN' and 'ZMQ_POLLOUT' on 'frontend_'.
    zmq::socket_poller_t *poller_backend_only =
      NULL; //  Only 'ZMQ_POLLIN' and 'ZMQ_POLLOUT' on 'backend_'.

    if (frontend_ != backend_) {
        poller_send_blocked = new (std::nothrow)
          zmq::socket_poller_t; //  All except 'ZMQ_POLLIN' on 'backend_'.
        poller_both_blocked = new (std::nothrow) zmq::
          socket_poller_t; //  All except 'ZMQ_POLLIN' on both 'frontend_' and 'backend_'.
        poller_frontend_only = new (std::nothrow) zmq::
          socket_poller_t; //  Only 'ZMQ_POLLIN' and 'ZMQ_POLLOUT' on 'frontend_'.
        poller_backend_only = new (std::nothrow) zmq::
          socket_poller_t; //  Only 'ZMQ_POLLIN' and 'ZMQ_POLLOUT' on 'backend_'.
        frontend_equal_to_backend = false;
    } else
        frontend_equal_to_backend = true;

    if (poller_all == NULL || poller_in == NULL
        || poller_receive_blocked == NULL
        || ((poller_send_blocked == NULL || poller_both_blocked == NULL)
            && !frontend_equal_to_backend)) {
        PROXY_CLEANUP ();
        return close_and_return (&msg, -1);
    }

    zmq::socket_poller_t *poller_wait =
      poller_in; //  Poller for blocking wait, initially all 'ZMQ_POLLIN'.

    //  Register 'frontend_' and 'backend_' with pollers.
    rc = poller_all->add (frontend_, NULL,
                          ZMQ_POLLIN | ZMQ_POLLOUT); //  Everything.
    CHECK_RC_EXIT_ON_FAILURE ();
    rc = poller_in->add (frontend_, NULL, ZMQ_POLLIN); //  All 'ZMQ_POLLIN's.
    CHECK_RC_EXIT_ON_FAILURE ();

    if (frontend_equal_to_backend) {
        //  If frontend_==backend_ 'poller_send_blocked' and 'poller_receive_blocked' are the same,
        //  so we don't need 'poller_send_blocked'. We need only 'poller_receive_blocked'.
        //  We also don't need 'poller_both_blocked', no need to initialize it.
        rc = poller_receive_blocked->add (frontend_, NULL, ZMQ_POLLOUT);
        CHECK_RC_EXIT_ON_FAILURE ();
    } else {
        rc = poller_all->add (backend_, NULL,
                              ZMQ_POLLIN | ZMQ_POLLOUT); //  Everything.
        CHECK_RC_EXIT_ON_FAILURE ();
        rc = poller_in->add (backend_, NULL, ZMQ_POLLIN); //  All 'ZMQ_POLLIN's.
        CHECK_RC_EXIT_ON_FAILURE ();
        rc = poller_both_blocked->add (
          frontend_, NULL, ZMQ_POLLOUT); //  Waiting only for 'ZMQ_POLLOUT'.
        CHECK_RC_EXIT_ON_FAILURE ();
        rc = poller_both_blocked->add (
          backend_, NULL, ZMQ_POLLOUT); //  Waiting only for 'ZMQ_POLLOUT'.
        CHECK_RC_EXIT_ON_FAILURE ();
        rc = poller_send_blocked->add (
          backend_, NULL,
          ZMQ_POLLOUT); //  All except 'ZMQ_POLLIN' on 'backend_'.
        CHECK_RC_EXIT_ON_FAILURE ();
        rc = poller_send_blocked->add (
          frontend_, NULL,
          ZMQ_POLLIN | ZMQ_POLLOUT); //  All except 'ZMQ_POLLIN' on 'backend_'.
        CHECK_RC_EXIT_ON_FAILURE ();
        rc = poller_receive_blocked->add (
          frontend_, NULL,
          ZMQ_POLLOUT); //  All except 'ZMQ_POLLIN' on 'frontend_'.
        CHECK_RC_EXIT_ON_FAILURE ();
        rc = poller_receive_blocked->add (
          backend_, NULL,
          ZMQ_POLLIN | ZMQ_POLLOUT); //  All except 'ZMQ_POLLIN' on 'frontend_'.
        CHECK_RC_EXIT_ON_FAILURE ();
        rc =
          poller_frontend_only->add (frontend_, NULL, ZMQ_POLLIN | ZMQ_POLLOUT);
        CHECK_RC_EXIT_ON_FAILURE ();
        rc =
          poller_backend_only->add (backend_, NULL, ZMQ_POLLIN | ZMQ_POLLOUT);
        CHECK_RC_EXIT_ON_FAILURE ();
    }

    if (control_) {
        ++nevents;

        // wherever you go, there you are.

        rc = poller_all->add (control_, NULL, ZMQ_POLLIN);
        CHECK_RC_EXIT_ON_FAILURE ();

        rc = poller_in->add (control_, NULL, ZMQ_POLLIN);
        CHECK_RC_EXIT_ON_FAILURE ();

        rc = poller_receive_blocked->add (control_, NULL, ZMQ_POLLIN);
        CHECK_RC_EXIT_ON_FAILURE ();

        rc = poller_send_blocked->add (control_, NULL, ZMQ_POLLIN);
        CHECK_RC_EXIT_ON_FAILURE ();

        rc = poller_both_blocked->add (control_, NULL, ZMQ_POLLIN);
        CHECK_RC_EXIT_ON_FAILURE ();

        rc = poller_frontend_only->add (control_, NULL, ZMQ_POLLIN);
        CHECK_RC_EXIT_ON_FAILURE ();

        rc = poller_backend_only->add (control_, NULL, ZMQ_POLLIN);
        CHECK_RC_EXIT_ON_FAILURE ();
    }

    bool request_processed = false, reply_processed = false;

    while (state != terminated) {
        //  Blocking wait initially only for 'ZMQ_POLLIN' - 'poller_wait' points to 'poller_in'.
        //  If one of receiving end's queue is full ('ZMQ_POLLOUT' not available),
        //  'poller_wait' is pointed to 'poller_receive_blocked', 'poller_send_blocked' or 'poller_both_blocked'.
        rc = poller_wait->wait (events, nevents, -1);
        if (rc < 0 && errno == EAGAIN)
            rc = 0;
        CHECK_RC_EXIT_ON_FAILURE ();

        //  Some of events waited for by 'poller_wait' have arrived, now poll for everything without blocking.
        rc = poller_all->wait (events, nevents, 0);
        if (rc < 0 && errno == EAGAIN)
            rc = 0;
        CHECK_RC_EXIT_ON_FAILURE ();

        //  Process events.
        for (int i = 0; i < rc; i++) {
            if (control_ && events[i].socket == control_) {
                rc = handle_control (control_, state, stats);
                CHECK_RC_EXIT_ON_FAILURE ();
                continue;
            }

            if (events[i].socket == frontend_) {
                frontend_in = (events[i].events & ZMQ_POLLIN) != 0;
                frontend_out = (events[i].events & ZMQ_POLLOUT) != 0;
            } else
                //  This 'if' needs to be after check for 'frontend_' in order never
                //  to be reached in case frontend_==backend_, so we ensure backend_in=false in that case.
                if (events[i].socket == backend_) {
                    backend_in = (events[i].events & ZMQ_POLLIN) != 0;
                    backend_out = (events[i].events & ZMQ_POLLOUT) != 0;
                }
        }

        if (state == active) {
            //  Process a request, 'ZMQ_POLLIN' on 'frontend_' and 'ZMQ_POLLOUT' on 'backend_'.
            //  In case of frontend_==backend_ there's no 'ZMQ_POLLOUT' event.
            if (frontend_in && (backend_out || frontend_equal_to_backend)) {
                rc = forward (frontend_, backend_, capture_, &msg,
                              stats.frontend.recv, stats.backend.send);
                CHECK_RC_EXIT_ON_FAILURE ();
                request_processed = true;
                frontend_in = backend_out = false;
            } else
                request_processed = false;

            //  Process a reply, 'ZMQ_POLLIN' on 'backend_' and 'ZMQ_POLLOUT' on 'frontend_'.
            //  If 'frontend_' and 'backend_' are the same this is not needed because previous processing
            //  covers all of the cases. 'backend_in' is always false if frontend_==backend_ due to
            //  design in 'for' event processing loop.
            if (backend_in && frontend_out) {
                rc = forward (backend_, frontend_, capture_, &msg,
                              stats.backend.recv, stats.frontend.send);
                CHECK_RC_EXIT_ON_FAILURE ();
                reply_processed = true;
                backend_in = frontend_out = false;
            } else
                reply_processed = false;

            if (request_processed || reply_processed) {
                //  If request/reply is processed that means we had at least one 'ZMQ_POLLOUT' event.
                //  Enable corresponding 'ZMQ_POLLIN' for blocking wait if any was disabled.
                if (poller_wait != poller_in) {
                    if (request_processed) { //  'frontend_' -> 'backend_'
                        if (poller_wait == poller_both_blocked)
                            poller_wait = poller_send_blocked;
                        else if (poller_wait == poller_receive_blocked
                                 || poller_wait == poller_frontend_only)
                            poller_wait = poller_in;
                    }
                    if (reply_processed) { //  'backend_' -> 'frontend_'
                        if (poller_wait == poller_both_blocked)
                            poller_wait = poller_receive_blocked;
                        else if (poller_wait == poller_send_blocked
                                 || poller_wait == poller_backend_only)
                            poller_wait = poller_in;
                    }
                }
            } else {
                //  No requests have been processed, there were no 'ZMQ_POLLIN' with corresponding 'ZMQ_POLLOUT' events.
                //  That means that out queue(s) is/are full or one out queue is full and second one has no messages to process.
                //  Disable receiving 'ZMQ_POLLIN' for sockets for which there's no 'ZMQ_POLLOUT',
                //  or wait only on both 'backend_''s or 'frontend_''s 'ZMQ_POLLIN' and 'ZMQ_POLLOUT'.
                if (frontend_in) {
                    if (frontend_out)
                        // If frontend_in and frontend_out are true, obviously backend_in and backend_out are both false.
                        // In that case we need to wait for both 'ZMQ_POLLIN' and 'ZMQ_POLLOUT' only on 'backend_'.
                        // We'll never get here in case of frontend_==backend_ because then frontend_out will always be false.
                        poller_wait = poller_backend_only;
                    else {
                        if (poller_wait == poller_send_blocked)
                            poller_wait = poller_both_blocked;
                        else if (poller_wait == poller_in)
                            poller_wait = poller_receive_blocked;
                    }
                }
                if (backend_in) {
                    //  Will never be reached if frontend_==backend_, 'backend_in' will
                    //  always be false due to design in 'for' event processing loop.
                    if (backend_out)
                        // If backend_in and backend_out are true, obviously frontend_in and frontend_out are both false.
                        // In that case we need to wait for both 'ZMQ_POLLIN' and 'ZMQ_POLLOUT' only on 'frontend_'.
                        poller_wait = poller_frontend_only;
                    else {
                        if (poller_wait == poller_receive_blocked)
                            poller_wait = poller_both_blocked;
                        else if (poller_wait == poller_in)
                            poller_wait = poller_send_blocked;
                    }
                }
            }
        }
    }
    PROXY_CLEANUP ();
    return close_and_return (&msg, 0);
}

#else //  ZMQ_HAVE_POLLER

int zmq::proxy_steerable (class socket_base_t *frontend_,
                          class socket_base_t *backend_,
                          class socket_base_t *capture_,
                          class socket_base_t *control_)
{
    msg_t msg;
    int rc = msg.init ();
    if (rc != 0)
        return -1;

    //  The algorithm below assumes ratio of requests and replies processed
    //  under full load to be 1:1.

    zmq_pollitem_t items[] = {{frontend_, 0, ZMQ_POLLIN, 0},
                              {backend_, 0, ZMQ_POLLIN, 0},
                              {control_, 0, ZMQ_POLLIN, 0}};
    const int qt_poll_items = control_ ? 3 : 2;

    zmq_pollitem_t itemsout[] = {{frontend_, 0, ZMQ_POLLOUT, 0},
                                 {backend_, 0, ZMQ_POLLOUT, 0}};

    stats_proxy stats = {0};

    //  Proxy can be in these three states
    proxy_state_t state = active;

    while (state != terminated) {
        //  Wait while there are either requests or replies to process.
        rc = zmq_poll (&items[0], qt_poll_items, -1);
        if (unlikely (rc < 0))
            return close_and_return (&msg, -1);

        if (control_ && items[2].revents & ZMQ_POLLIN) {
            rc = handle_control (control_, state, stats);
            if (unlikely (rc < 0))
                return close_and_return (&msg, -1);
        }

        //  Get the pollout separately because when combining this with pollin it maxes the CPU
        //  because pollout shall most of the time return directly.
        //  POLLOUT is only checked when frontend and backend sockets are not the same.
        if (frontend_ != backend_) {
            rc = zmq_poll (&itemsout[0], 2, 0);
            if (unlikely (rc < 0)) {
                return close_and_return (&msg, -1);
            }
        }

        if (state == active && items[0].revents & ZMQ_POLLIN
            && (frontend_ == backend_ || itemsout[1].revents & ZMQ_POLLOUT)) {
            rc = forward (frontend_, backend_, capture_, &msg,
                          stats.frontend.recv, stats.backend.send);
            if (unlikely (rc < 0))
                return close_and_return (&msg, -1);
        }
        //  Process a reply
        if (state == active && frontend_ != backend_
            && items[1].revents & ZMQ_POLLIN
            && itemsout[0].revents & ZMQ_POLLOUT) {
            rc = forward (backend_, frontend_, capture_, &msg,
                          stats.backend.recv, stats.frontend.send);
            if (unlikely (rc < 0))
                return close_and_return (&msg, -1);
        }
    }

    return close_and_return (&msg, 0);
}

#endif //  ZMQ_HAVE_POLLER
