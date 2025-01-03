import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

export default defineConfig({
  server: {
    port: 3000,
    historyApiFallback: true,
    hmr: {
      protocol: 'ws',
    },
    proxy: {
      '/ws': {
        target: 'ws://localhost:8080',
        ws: true,
        changeOrigin: true
      },
      '/peerjs': {
        target: 'http://localhost:9000',
        ws: true
      }
    }
  },
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: "node_modules/@ricky0123/vad-web/dist/vad.worklet.bundle.min.js",
          dest: "./",
        },
        {
          src: "node_modules/@ricky0123/vad-web/dist/silero_vad_v5.onnx",
          dest: "./",
        },
        {
          src: "node_modules/@ricky0123/vad-web/dist/silero_vad_legacy.onnx",
          dest: "./",
        },
        {
          src: "node_modules/onnxruntime-web/dist/*.wasm",
          dest: "./",
        },
        {
          src: "node_modules/onnxruntime-web/dist/*.mjs",
          dest: "./",
        },
      ],
    }),
  ],
  build: {
    rollupOptions: {
      input: {
        main: '/index.html',
      },
    },
  },
});
