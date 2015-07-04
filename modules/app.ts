import pitcher = require("pitcher");
import { Evernote } from "evernote";
import evernote = require("./evernote");
import en = require("../lib/evernote-promisified");
import Promise = require("bluebird");

export class App {
  constructor(
    private readNotesMetadata: Evernote.NoteMetadata[],
    private noteStore: en.NoteStore,
    private user: Evernote.User,
    private newDigestNotes: Evernote.NoteMetadata[],
    private targetNotebook: Evernote.Notebook) {
  }

  run() {
    return Promise.all([
      this.copyNewNotes(),
      this.deleteReadDigestNotes()
    ])
  }

  copyNewNotes() {
    var i = 0;
    return Promise.all(this.newDigestNotes.map((m) => {
      return this.noteStore.copyNote(m.guid, this.targetNotebook.guid).then((note) => {
        var modifiedNote = new Evernote.Note({ guid: note.guid, title: note.title });
        modifiedNote.attributes = new Evernote.NoteAttributes();
        modifiedNote.attributes.reminderTime = (Math.floor(new Date().getTime() / 1000) - (i++)) * 1000;
        return this.noteStore.updateNote(modifiedNote);
      })
    }))
  }

  deleteReadDigestNotes() {
    return Promise.all(this.readNotesMetadata.map((m) => this.noteStore.expungeNote(m.guid)));
  }
}

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
      var user = graph.userProvider.get();
      var newDigestNotes = graph.newDigestNotesProvider.get();
      var targetNotebook = graph.targetNotebookProvider.get();

      pitcher.awaitAll([readNotesMetadata[2],noteStore[2],user[2],newDigestNotes[2],targetNotebook[2]], (_, err) => {
        err ? reject(err) : resolve(new this.providesApp(readNotesMetadata[0], noteStore[0], user[0], newDigestNotes[0], targetNotebook[0]));
      });
    });
  }
}


export class InferredModuleGraph {
  appProvider = pitcher.typeOfClass(Module.prototype.providesApp);
}

export interface ModuleGraph extends InferredModuleGraph, evernote.ModuleGraph { }
