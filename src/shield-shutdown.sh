#!/usr/bin/env sh
/opt/bin/adb connect 192.168.1.170
/opt/bin/adb shell reboot -p
/opt/bin/adb connect 192.168.1.170
/opt/bin/adb shell reboot -p