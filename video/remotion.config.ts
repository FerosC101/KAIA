import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.setConcurrency(2);
Config.setCodec("h264");
Config.setCrf(23);        // social-friendly file size at 1080p
Config.setAudioBitrate("160k");
