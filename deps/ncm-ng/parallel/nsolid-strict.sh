#!/bin/sh

case ${OSTYPE} in
    darwin*)
	NSOLID_TOP="/usr/local"
	;;
    linux*)
	NSOLID_TOP="/opt"
	;;
    *)
	echo "Unsupported OS ${OSTYPE}, exiting..."
	exit 1
	;;
esac

NSOLID_VULN_DB_PATH="${NSOLID_TOP}/nsolid/console/lib/snyk-snapshot.json"
NSOLID_VULN_LIB_PATH="$PWD/lib/snyk-snapshot.json"

if test -f "$NSOLID_VULN_DB_PATH"; then
  cp -rf $NSOLID_VULN_DB_PATH $NSOLID_VULN_LIB_PATH
fi

if [ "$1" = "--config" ] || [ "$1" = "-c" ]; then
  echo "Opening the configuration file using the system's default text editor"
  ./parallel/agent.js "--config"
  exit
fi

targetdir() {
  CURRENTPWD=$PWD
  cd "$(dirname "$1")"
  LINK=$(readlink "$(basename "$1")")
  while [ "$LINK" ]; do
    cd "$(dirname "$LINK")"
    LINK=$(readlink "$(basename "$1")")
  done
  TARGETPATH="$PWD/$(basename "$1")"
  cd "$CURRENTPWD"
  echo $(dirname "$TARGETPATH")
}

pwd=$(pwd)

if test -f "$1" ; then
  target="$(targetdir "$1")"
  cd "$(dirname "$0")"
  if ! ./ncm-agent "$target" ; then
    exit
  fi
fi

cd "$pwd"
nsolid "$*"
