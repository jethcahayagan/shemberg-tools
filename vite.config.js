import { defineConfig } from "vite";
export default defineConfig({
  base: "./",
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("exceljs")) return "excel";
          if (id.includes("docx")) return "word";
          if (id.includes("jspdf")) return "pdf";
        },
      },
    },
  },
});
