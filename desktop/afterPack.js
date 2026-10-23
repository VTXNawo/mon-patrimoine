// Put the app icon and name on the .exe (no Wine needed).
const fs = require("fs");
const path = require("path");
const ResEdit = require("resedit");

exports.default = async function (context) {
  if (context.electronPlatformName !== "win32") return;
  const exe = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const exeFile = ResEdit.NtExecutable.from(fs.readFileSync(exe), { ignoreCert: true });
  const res = ResEdit.NtExecutableResource.from(exeFile);
  const iconFile = ResEdit.Data.IconFile.from(fs.readFileSync(path.join(__dirname, "build", "icon.ico")));
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
  const target = groups[0];
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
    res.entries, target ? target.id : 1, target ? target.lang : 1033, iconFile.icons.map((i) => i.data));
  const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0];
  if (vi) {
    const lang = vi.getAllLanguagesForStringValues()[0] || { lang: 1033, codepage: 1200 };
    vi.setStringValues(lang, { ProductName: "Mon patrimoine", FileDescription: "Mon patrimoine", CompanyName: "VTXNawo", InternalName: "Mon patrimoine", OriginalFilename: "Mon patrimoine.exe" });
    vi.outputToResourceEntries(res.entries);
  }
  res.outputResource(exeFile);
  fs.writeFileSync(exe, Buffer.from(exeFile.generate()));
  console.log("  • icon and name set on", path.basename(exe), "(icon group", target ? target.id : 1, ")");
};
