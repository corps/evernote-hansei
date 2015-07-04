import pitcher = require("pitcher");

export class Module implements pitcher.Builds<ModuleGraph> {
  providedPlatform = process.platform;
  providedEnv: { [k: string]: string } = process.env;

  providesHomeDir(platform: string, env: { [k: string]: string }) {
    var homeVar = platform == 'win32' ? 'USERPROFILE' : 'HOME';
    return env[homeVar];
  }

  install(graph: ModuleGraph, installed: pitcher.InstalledModules, override: boolean) {
    var moduleIdentity = pitcher.identifyModuleBase(this);
    if (!override && installed[moduleIdentity]) return;

    installed[moduleIdentity] = true;


    graph.platformProvider = pitcher.singletonProvider(graph.platformProvider)((resolve) =>resolve(this.providedPlatform));

    graph.envProvider = pitcher.singletonProvider(graph.envProvider)((resolve) =>resolve(this.providedEnv));

    graph.homeDirProvider = pitcher.singletonProvider(graph.homeDirProvider)((resolve, reject) => {
      var platform = graph.platformProvider.get();
      var env = graph.envProvider.get();

      pitcher.awaitAll([platform[2],env[2]], (_, err) => {
        err ? reject(err) : resolve(this.providesHomeDir(platform[0], env[0]));
      });
    });
  }
}


export class InferredModuleGraph {
  platformProvider = pitcher.typeOfGiven(Module.prototype.providedPlatform);
  envProvider = pitcher.typeOfGiven(Module.prototype.providedEnv);
  homeDirProvider = pitcher.typeOfProvider(Module.prototype.providesHomeDir);
}

export interface ModuleGraph extends InferredModuleGraph {}
