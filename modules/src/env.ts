import pitcher = require("pitcher");

export class Module implements pitcher.Module {
  providedPlatform = process.platform;
  providedEnv: { [k: string]: string } = process.env;

  providesHomeDir(platform: string, env: { [k: string]: string }) {
    var homeVar = platform == 'win32' ? 'USERPROFILE' : 'HOME';
    return env[homeVar];
  }
}
