import pitcher = require("pitcher");
import evernote = require("./evernote");
import { App } from "../../lib/app";

export class Module implements pitcher.Builds<ModuleGraph> {
  includes = [evernote.Module];
  providesApp = App;

  install(graph: ModuleGraph, installed: pitcher.InstalledModules, override: boolean) {
    var moduleIdentity = pitcher.identifyModuleBase(this);
    if (!override && installed[moduleIdentity]) return;

    installed[moduleIdentity] = true;

    new evernote.Module().install(graph, installed, false);

    graph.appProvider = pitcher.singletonProvider(graph.appProvider)((resolve, reject) => {
      var readNotesMetadata = graph.readNotesMetadataProvider.get();
      var noteStore = graph.noteStoreProvider.get();
      var config = graph.configProvider.get();
      var user = graph.userProvider.get();
      var parsedCommandLine = graph.parsedCommandLineProvider.get();
      var sourceNotebooks = graph.sourceNotebooksProvider.get();
      var unfoundNotebookNames = graph.unfoundNotebookNamesProvider.get();
      var newDigestNotes = graph.newDigestNotesProvider.get();
      var targetNotebook = graph.targetNotebookProvider.get();

      pitcher.awaitAll([readNotesMetadata[2],noteStore[2],config[2],user[2],parsedCommandLine[2],sourceNotebooks[2],unfoundNotebookNames[2],newDigestNotes[2],targetNotebook[2]], (_, err) => {
        err ? reject(err) : resolve(new this.providesApp(readNotesMetadata[0], noteStore[0], config[0], user[0], parsedCommandLine[0], sourceNotebooks[0], unfoundNotebookNames[0], newDigestNotes[0], targetNotebook[0]));
      });
    });
  }
}


export class InferredModuleGraph {
  appProvider = pitcher.typeOfClass(Module.prototype.providesApp);
}

export interface ModuleGraph extends InferredModuleGraph, evernote.ModuleGraph {}
