import pitcher = require("pitcher");
import fs = require("fs");
import Promise = require("bluebird");
import path = require("path");

import commandline = require("./commandline");
import env = require("./env");

var readFile = Promise.promisify<string, string, string>(fs.readFile);
var writeFile = Promise.promisify<void, string, any>(fs.writeFile);

export class Config {
  authToken: string = "";
  notebookNames: string[] = [];
  targetNotebookGuid: string = "";

  constructor(public configFilePath: string) { }

  static load(configFilePath: string, opts: { [k: string]: string }) {
    var result = new Config(configFilePath);
    return pitcher.promised(readFile(configFilePath, "utf8").then((data) => {
      JSON.parse(data, (k, v) => {
        if (k)
          (<any>result)[k] = v;
        return v;
      })
    }).catch(() => { }).then(() => {
      if (opts["authenticate"])
        result.authToken = opts["authenticate"];

      if (opts["notebooks"])
        result.notebookNames = opts["notebooks"].split(",");

      return result.save();
    }));
  }

  save() {
    return writeFile(this.configFilePath, JSON.stringify(this)).then(() => this);
  }
}

export class Module implements pitcher.Builds<ModuleGraph> {
  includes = [commandline.Module, env.Module];

  providesConfig = Config.load;
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
        argName: "\"My Notebook,Study Notebook\""
      }
    ];
  }

  install(graph: ModuleGraph, installed: pitcher.InstalledModules, override: boolean) {
    var moduleIdentity = pitcher.identifyModuleBase(this);
    if (!override && installed[moduleIdentity]) return;

    installed[moduleIdentity] = true;

    new commandline.Module().install(graph, installed, false);
    new env.Module().install(graph, installed, false);

    graph.configProvider = pitcher.promisedProvider(graph.configProvider)((resolve, reject) => {
      var configFilePath = graph.configFilePathProvider.get();
      var opts = graph.optsProvider.get();

      pitcher.awaitAll([configFilePath[2],opts[2]], (_, err) => {
        err ? reject(err) : resolve(this.providesConfig(configFilePath[0], opts[0]));
      });
    });

    graph.configFilePathProvider = pitcher.singletonProvider(graph.configFilePathProvider)((resolve, reject) => {
      var homeDir = graph.homeDirProvider.get();

      pitcher.awaitAll([homeDir[2]], (_, err) => {
        err ? reject(err) : resolve(this.providesConfigFilePath(homeDir[0]));
      });
    });

    graph.commandLineOptionsCollection = graph.commandLineOptionsCollection || [];
    graph.commandLineOptionsCollection.push(pitcher.singletonProvider(graph.commandLineOptionsProvider)((resolve) => {
      resolve(this.contributesCommandLineOptions());
    }));
    if (graph.commandLineOptionsProvider == null) graph.commandLineOptionsProvider = pitcher.collectionProvider(graph.commandLineOptionsProvider)(graph.commandLineOptionsCollection);
  }
}


export class InferredModuleGraph {
  configProvider = pitcher.typeOfProviderPromised(Module.prototype.providesConfig);
  configFilePathProvider = pitcher.typeOfProvider(Module.prototype.providesConfigFilePath);
  commandLineOptionsProvider = pitcher.typeOfProvider(Module.prototype.contributesCommandLineOptions);
  commandLineOptionsCollection = pitcher.collectionTypeOfProvider(Module.prototype.contributesCommandLineOptions);
}

export interface ModuleGraph extends InferredModuleGraph, commandline.ModuleGraph, env.ModuleGraph { }
