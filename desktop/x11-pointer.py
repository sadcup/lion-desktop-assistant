"""Stream changes in root-window pointer position from X11."""
import ctypes as c
import time

x11 = c.CDLL("libX11.so.6")
x11.XOpenDisplay.argtypes = [c.c_char_p]
x11.XOpenDisplay.restype = c.c_void_p
x11.XDefaultRootWindow.argtypes = [c.c_void_p]
x11.XDefaultRootWindow.restype = c.c_ulong
x11.XQueryPointer.argtypes = [
    c.c_void_p, c.c_ulong, c.POINTER(c.c_ulong), c.POINTER(c.c_ulong),
    c.POINTER(c.c_int), c.POINTER(c.c_int), c.POINTER(c.c_int),
    c.POINTER(c.c_int), c.POINTER(c.c_uint),
]
display = x11.XOpenDisplay(None)
if not display:
    raise SystemExit("Cannot connect to X11")
root = x11.XDefaultRootWindow(display)
root_return, child = c.c_ulong(), c.c_ulong()
x, y, window_x, window_y = (c.c_int() for _ in range(4))
mask = c.c_uint()
previous = None
while True:
    if x11.XQueryPointer(display, root, c.byref(root_return), c.byref(child),
                        c.byref(x), c.byref(y), c.byref(window_x),
                        c.byref(window_y), c.byref(mask)):
        position = x.value, y.value, mask.value, child.value
        if position != previous:
            print(*position, flush=True)
            previous = position
    time.sleep(.012)
