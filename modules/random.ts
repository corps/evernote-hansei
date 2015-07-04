import pitcher = require("pitcher");
import uuid = require("node-uuid");

export class Module implements pitcher.Builds<ModuleGraph> {
  providesUuidGenerator() {
    return () => {
      return uuid.v4().toString();
    }
  }

  providedRand = Math.random;

  install(graph: ModuleGraph, installed: pitcher.InstalledModules, override: boolean) {
    var moduleIdentity = pitcher.identifyModuleBase(this);
    if (!override && installed[moduleIdentity]) return;

    installed[moduleIdentity] = true;


    graph.uuidGeneratorProvider = pitcher.singletonProvider(graph.uuidGeneratorProvider)((resolve) => {
      resolve(this.providesUuidGenerator());
    });

    graph.randProvider = pitcher.singletonProvider(graph.randProvider)((resolve) =>resolve(this.providedRand));
  }
}


export class InferredModuleGraph {
  uuidGeneratorProvider = pitcher.typeOfProvider(Module.prototype.providesUuidGenerator);
  randProvider = pitcher.typeOfGiven(Module.prototype.providedRand);
}

export interface ModuleGraph extends InferredModuleGraph { }
