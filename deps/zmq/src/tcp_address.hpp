/* SPDX-License-Identifier: MPL-2.0 */

#ifndef __ZMQ_TCP_ADDRESS_HPP_INCLUDED__
#define __ZMQ_TCP_ADDRESS_HPP_INCLUDED__

#if !defined ZMQ_HAVE_WINDOWS
#include <sys/socket.h>
#include <netinet/in.h>
#endif

#include "ip_resolver.hpp"

namespace zmq
{
class tcp_address_t
{
  public:
    tcp_address_t ();
    tcp_address_t (const sockaddr *sa_, socklen_t sa_len_);

    //  This function translates textual TCP address into an address
    //  structure. If 'local' is true, names are resolved as local interface
    //  names. If it is false, names are resolved as remote hostnames.
    //  If 'ipv6' is true, the name may resolve to IPv6 address.
    int resolve (const char *name_, bool local_, bool ipv6_);

    //  The opposite to resolve()
    int to_string (std::string &addr_) const;

#if defined ZMQ_HAVE_WINDOWS
    unsigned short family () const;
#else
    sa_family_t family () const;
#endif
    const sockaddr *addr () const;
    socklen_t addrlen () const;

    const sockaddr *src_addr () const;
    socklen_t src_addrlen () const;
    bool has_src_addr () const;

  private:
    ip_addr_t _address;
    ip_addr_t _source_address;
    bool _has_src_addr;
};

class tcp_address_mask_t
{
  public:
    tcp_address_mask_t ();

    // This function enhances tcp_address_t::resolve() with ability to parse
    // additional cidr-like(/xx) mask value at the end of the name string.
    // Works only with remote hostnames.
    int resolve (const char *name_, bool ipv6_);

    bool match_address (const struct sockaddr *ss_, socklen_t ss_len_) const;

  private:
    ip_addr_t _network_address;
    int _address_mask;
};
}

#endif
