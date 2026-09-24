// electron-builder afterSign hook — notarizes the signed .app with Apple.
// Credentials come from .env.local (gitignored). Set SKIP_NOTARIZE=true to
// skip during local test builds.

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env.local") });
const { notarize } = require("@electron/notarize");

exports.default = async function notarizeApp(context) {
  const { appOutDir, electronPlatformName } = context;
  if (electronPlatformName !== "darwin") return;

  if (process.env.SKIP_NOTARIZE === "true") {
    console.log("Skipping notarization (SKIP_NOTARIZE=true)");
    return;
  }

  if (
    !process.env.APPLE_ID ||
    !process.env.APPLE_APP_SPECIFIC_PASSWORD ||
    !process.env.APPLE_TEAM_ID
  ) {
    console.log(
      "Skipping notarization — missing APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, or APPLE_TEAM_ID.",
    );
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;
  // Pull the bundle ID from electron-builder rather than hardcoding it.
  const appBundleId = context.packager.appInfo.id;

  console.log(`Notarizing ${appName}…`);
  console.log(`   App path:   ${appPath}`);
  console.log(`   Bundle ID:  ${appBundleId}`);

  try {
    await notarize({
      appBundleId,
      appPath,
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
      teamId: process.env.APPLE_TEAM_ID,
    });
    console.log(`Notarization complete for ${appName}`);
  } catch (err) {
    console.error("Notarization failed:", err);
    throw err;
  }
};
