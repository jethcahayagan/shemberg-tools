import regular from "./fonts/LiberationSans-Regular.ttf?inline";
import bold from "./fonts/LiberationSans-Bold.ttf?inline";
import license from "./fonts/LICENSE.txt?raw";
export function setReportFont(pdf) {
  pdf.addFileToVFS("LiberationSans-Regular.ttf", regular.split(",")[1]);
  pdf.addFileToVFS("LiberationSans-Bold.ttf", bold.split(",")[1]);
  pdf.addFont("LiberationSans-Regular.ttf", "ReportSans", "normal");
  pdf.addFont("LiberationSans-Bold.ttf", "ReportSans", "bold");
  pdf.setFont("ReportSans", "normal");
  pdf.setProperties({
    title: "Shemberg QA Lab Chemicals Inventory",
    author: "Jermaine Theus Cahayagan",
    subject: "Report font license: " + license,
  });
}
