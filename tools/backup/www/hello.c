#include <stdio.h>
#include <emscripten.h> // For EMSCRIPTEN_KEEPALIVE

EMSCRIPTEN_KEEPALIVE
void greet() {
    printf("Hello from WebAssembly!\n");
}

int main() {
    printf("Wasm module loaded.\n");
    return 0;
}