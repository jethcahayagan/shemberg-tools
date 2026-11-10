import { defineConfig } from "vite";
export default defineConfig({
  base: "./",
  build: {
    rollupOptions: {
      input: { inventory: "index.html", chemicals: "chemicals.html" },
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
