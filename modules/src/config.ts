import pitcher = require("pitcher");
import path = require("path");
import env = require("./env");
import commandline = require("./commandline");
import { Config } from "../../lib/config"

export class Module implements pitcher.Module {
  includes = [commandline.Module, env.Module];

  providesConfig = (configFilePath: string, opts: { [k: string]: string }) => {
    return pitcher.promised(Config.load(configFilePath, opts));
  }

  providesConfigFilePath(homeDir: string) {
    return path.join(homeDir, ".hansei-config.json");
  }

  contributesCommandLineOptions(): commandline.CommandLineOption[] {
    return [
      {
        short: "t",
        long: "authenticate",
        argName: "token",
        description: "sets the authentication token to log into evernote with"
      },
      {
        short: "n",
        long: "notebooks",
        argName: "\"My Notebook,Study Notebook\"",
        description: "sets the notebooks to pick notes randomly from. comma separated"
      },
      {
        short: "d",
        long: "digest",
        argName: "digest-size",
        description: "sets the number of notes to add to the digest."
      }
    ];
  }
}
