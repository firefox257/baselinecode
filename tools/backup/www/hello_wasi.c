#include <stdio.h> // For printf

// To make 'greet' callable from JS, ensure it's exported.
// This can be done via a linker command or an attribute.
__attribute__((export_name("greet")))
void greet() {
    printf("Hello from WebAssembly (Clang/WASI)!\n");
}

// main is the standard entry point for WASI applications
// when linked with wasi-libc's C runtime (_start).
int main() {
    printf("Wasm module loaded via main (Clang/WASI).\n");
    greet(); // Let's call greet from main to see its output
    return 0;
}
/*
clang --target=wasm32-wasi --sysroot=C:\Users\firef\wasi-sdk-25.0-x86_64-windows\share\wasi-sysroot hello_wasi.c -o hello_wasi.wasm -Wl,--export=greet




# Set this variable to the path where you extracted the WASI SDK
WASI_SDK_PATH="/path/to/your/wasi-sdk"

$WASI_SDK_PATH/bin/clang \
    --target=wasm32-wasi \
    --sysroot=$WASI_SDK_PATH/share/wasi-sysroot \
    hello_wasi.c \
    -o hello_wasi.wasm \
    -Wl,--export=greet \
    # -Wl,--export=main # 'main' is called by _start from wasi-libc,
                       # export if you need to call it manually from JS again.
    # -Wl,--no-entry # Use if you don't have a main and _start, and manage entry yourself.
                     # For printf and standard main, you want wasi-libc's _start.
    # -nostdlib      # Don't use this if you want printf and main from wasi-libc.


*/