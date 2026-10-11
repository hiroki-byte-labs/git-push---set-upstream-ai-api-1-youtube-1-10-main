/**
 * Note: When using the Node.JS APIs, the config file
 * doesn't apply. Instead, pass options directly to the APIs.
 *
 * All configuration options: https://remotion.dev/docs/config
 */

import { Config } from "@remotion/cli/config";

Config.setRspack(true);
Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
// T110: 既定のChrome Headless Shell（Chromium 157）は、この端末（macOS 26 / Darwin 25.6）で
// requestAnimationFrameが進まず「Waiting for root component to load」で止まった（未改変の雛形でも再現）。
// 公式の代替であるChrome for Testing（新しいヘッドレス）では描画できたため、こちらを使う。
Config.setChromeMode("chrome-for-testing");
