import pitcher = require("pitcher");
import { Evernote } from "evernote";
import Promise = require("bluebird");
import config = require("./config");
import random = require("./random");
import en = require("../lib/evernote-promisified");
import commandline = require("./commandline");

export class Module implements pitcher.Builds<ModuleGraph> {
  includes = [config.Module, random.Module];

  providedDigestSize = 5;
  providedIsSandbox = false;

  providesClient(config: config.Config, isSandbox: boolean) {
    return new Evernote.Client({ token: config.authToken, sandbox: isSandbox });
  }

  providesUserStore(client: Evernote.Client) {
    return en.promisifyUserStore(client.getUserStore());
  }

  providesNoteStore(client: Evernote.Client) {
    return en.promisifyNoteStore(client.getNoteStore());
  }

  providesUser(userStore: en.UserStore) {
    return pitcher.promised(userStore.getUser());
  }

  providesDefaultTargetNotebook(uuidGenerator: () => string) {
    var newNb = new Evernote.Notebook();
    newNb.guid = uuidGenerator();
    newNb.name = "Daily Hansei";
    return newNb;
  }

  providesNotebooksList(noteStore: en.NoteStore) {
    return pitcher.promised(noteStore.listNotebooks());
  }

  providesUnreadDigestFilter(targetNotebook: Evernote.Notebook) {
    var result = new Evernote.NoteFilter();
    result.notebookGuid = targetNotebook.guid;
    result.words = "-reminderDoneTime:*";
    return result;
  }

  providesReadDigestFilter(targetNotebook: Evernote.Notebook) {
    var result = new Evernote.NoteFilter();
    result.notebookGuid = targetNotebook.guid;
    result.words = "reminderDoneTime:*";
    return result;
  }

  providesUnreadNoteCount(
    noteStore: en.NoteStore,
    targetNotebook: Evernote.Notebook,
    unreadDigestFilter: Evernote.NoteFilter) {
    return pitcher.promised(noteStore.findNoteCounts(unreadDigestFilter, false).then((counts) => {
      if (counts.notebookCounts == null) return 0;
      return counts.notebookCounts[targetNotebook.guid] || 0;
    }))
  }

  providesReadNotesMetadata(
    noteStore: en.NoteStore,
    readDigestFilter: Evernote.NoteFilter) {
    var resultSpec = new Evernote.NotesMetadataResultSpec();
    return pitcher.promised(noteStore.findNotesMetadata(readDigestFilter, 0, 100, resultSpec).then((metaList) => {
      return metaList.notes;
    }));
  }

  providesRandomNoteFinder = pitcher.factory((
    noteStore: en.NoteStore,
    sourceNotebooks: Evernote.Notebook[],
    rand: () => number) => {

    var retries = 0;
    var findANote = (): Promise<Evernote.NoteMetadata> => {
      if (retries++ > 3) {
        return Promise.reject(new Error(
          "Could not find a source note after 3 tries! Make sure your source notebooks are not empty."));
      }
      var notebook = sourceNotebooks[Math.floor(rand() * sourceNotebooks.length)];
      var filter = new Evernote.NoteFilter({ notebookGuid: notebook.guid });
      return noteStore.findNoteCounts(filter, false).then((counts) => {
        var count = counts.notebookCounts[notebook.guid] || 0;
        var offset = Math.floor(rand() * count);
        return noteStore.findNotesMetadata(filter, offset, 1, new Evernote.NotesMetadataResultSpec());
      }).then((metaList) => {
        if (metaList.notes.length == 0) {
          return findANote();
        }
        return Promise.resolve(metaList.notes[0]);
      });
    }

    return findANote();
  });

  providesNewDigestNotes(
    noteStore: en.NoteStore,
    randomNoteFinder: () => Promise<Evernote.NoteMetadata>,
    digestSize: number,
    unreadNoteCount: number) {

    console.log("Found", unreadNoteCount, "unread digest notes");
    var notesToAdd = Math.max(digestSize - unreadNoteCount, 0);
    console.log("Adding", notesToAdd, "more back in");

    var retries = 0;
    var result: Evernote.NoteMetadata[] = [];
    var seenGuids: { [k: string]: boolean } = {};
    var findNotes = (): Promise<Evernote.NoteMetadata[]> => {
      if (retries++ >= 5 * digestSize || notesToAdd <= 0) {
        return Promise.resolve(result);
      }

      return randomNoteFinder().then((next) => {
        if (seenGuids[next.guid]) return findNotes();
        seenGuids[next.guid] = true;
        notesToAdd--;
        result.push(next);
        return findNotes();
      })
    }

    return pitcher.promised(findNotes());
  }

  providesSourceNotebooks(
    notebooksList: Evernote.Notebook[],
    parsedCommandLine: typeof commandline._commander,
    config: config.Config) {
    if (config.notebookNames.length == 0) {
      parsedCommandLine.outputHelp();
      throw new Error("No source notebook names have been set!  Set them before using hansei.")
    }

    console.log("Looking in source notebooks ", config.notebookNames.join(", "));

    var result = notebooksList.filter((n) => config.notebookNames.indexOf(n.name) != -1);
    var resultingNames = result.map((n) => n.name);
    var missing = config.notebookNames.filter((n) => resultingNames.indexOf(n) == -1)

    if (result.length != config.notebookNames.length) {
      parsedCommandLine.outputHelp();
      throw new Error("Notebook(s) named " + missing.join(", ") + " could not be found!");
    }

    return result;
  }

  providesTargetNotebook(
    noteStore: en.NoteStore,
    notebooksList: Evernote.Notebook[],
    defaultTargetNotebook: Evernote.Notebook,
    config: config.Config) {

    var findExistingNotebook: Promise<Evernote.Notebook>;
    var searchByName = () => {
      var existing = notebooksList.filter((n) => n.name == defaultTargetNotebook.name)[0];
      return Promise.resolve(existing);
    }

    if (config.targetNotebookGuid) {
      findExistingNotebook = noteStore.getNotebook(config.targetNotebookGuid).catch(searchByName);
    } else {
      findExistingNotebook = searchByName();
    }

    return pitcher.promised(findExistingNotebook.catch((err) => {
      var isNotFound = err instanceof Evernote.EDAMNotFoundException;
      var isBadUuid = !isNotFound
        && err instanceof Evernote.EDAMUserException
        && err.errorCode == Evernote.EDAMErrorCode.DATA_REQUIRED;
      if (!isNotFound && !isBadUuid) {
        throw err;
      }

      return <Evernote.Notebook>null;
    })).then((nb) => {
      if (!nb)
        return noteStore.createNotebook(defaultTargetNotebook);
      else
        return nb
    }).then((nb) => {
      config.targetNotebookGuid = nb.guid;
      return config.save().then(() => nb);
    });
  }

  install(graph: ModuleGraph, installed: pitcher.InstalledModules, override: boolean) {
    var moduleIdentity = pitcher.identifyModuleBase(this);
    if (!override && installed[moduleIdentity]) return;

    installed[moduleIdentity] = true;

    new config.Module().install(graph, installed, false);
    new random.Module().install(graph, installed, false);

    graph.digestSizeProvider = pitcher.singletonProvider(graph.digestSizeProvider)((resolve) =>resolve(this.providedDigestSize));

    graph.isSandboxProvider = pitcher.singletonProvider(graph.isSandboxProvider)((resolve) =>resolve(this.providedIsSandbox));

    graph.clientProvider = pitcher.singletonProvider(graph.clientProvider)((resolve, reject) => {
      var config = graph.configProvider.get();
      var isSandbox = graph.isSandboxProvider.get();

      pitcher.awaitAll([config[2],isSandbox[2]], (_, err) => {
        err ? reject(err) : resolve(this.providesClient(config[0], isSandbox[0]));
      });
    });

    graph.userStoreProvider = pitcher.singletonProvider(graph.userStoreProvider)((resolve, reject) => {
      var client = graph.clientProvider.get();

      pitcher.awaitAll([client[2]], (_, err) => {
        err ? reject(err) : resolve(this.providesUserStore(client[0]));
      });
    });

    graph.noteStoreProvider = pitcher.singletonProvider(graph.noteStoreProvider)((resolve, reject) => {
      var client = graph.clientProvider.get();

      pitcher.awaitAll([client[2]], (_, err) => {
        err ? reject(err) : resolve(this.providesNoteStore(client[0]));
      });
    });

    graph.userProvider = pitcher.promisedProvider(graph.userProvider)((resolve, reject) => {
      var userStore = graph.userStoreProvider.get();

      pitcher.awaitAll([userStore[2]], (_, err) => {
        err ? reject(err) : resolve(this.providesUser(userStore[0]));
      });
    });

    graph.defaultTargetNotebookProvider = pitcher.singletonProvider(graph.defaultTargetNotebookProvider)((resolve, reject) => {
      var uuidGenerator = graph.uuidGeneratorProvider.get();

      pitcher.awaitAll([uuidGenerator[2]], (_, err) => {
        err ? reject(err) : resolve(this.providesDefaultTargetNotebook(uuidGenerator[0]));
      });
    });

    graph.notebooksListProvider = pitcher.promisedProvider(graph.notebooksListProvider)((resolve, reject) => {
      var noteStore = graph.noteStoreProvider.get();

      pitcher.awaitAll([noteStore[2]], (_, err) => {
        err ? reject(err) : resolve(this.providesNotebooksList(noteStore[0]));
      });
    });

    graph.unreadDigestFilterProvider = pitcher.singletonProvider(graph.unreadDigestFilterProvider)((resolve, reject) => {
      var targetNotebook = graph.targetNotebookProvider.get();

      pitcher.awaitAll([targetNotebook[2]], (_, err) => {
        err ? reject(err) : resolve(this.providesUnreadDigestFilter(targetNotebook[0]));
      });
    });

    graph.readDigestFilterProvider = pitcher.singletonProvider(graph.readDigestFilterProvider)((resolve, reject) => {
      var targetNotebook = graph.targetNotebookProvider.get();

      pitcher.awaitAll([targetNotebook[2]], (_, err) => {
        err ? reject(err) : resolve(this.providesReadDigestFilter(targetNotebook[0]));
      });
    });

    graph.unreadNoteCountProvider = pitcher.promisedProvider(graph.unreadNoteCountProvider)((resolve, reject) => {
      var noteStore = graph.noteStoreProvider.get();
      var targetNotebook = graph.targetNotebookProvider.get();
      var unreadDigestFilter = graph.unreadDigestFilterProvider.get();

      pitcher.awaitAll([noteStore[2],targetNotebook[2],unreadDigestFilter[2]], (_, err) => {
        err ? reject(err) : resolve(this.providesUnreadNoteCount(noteStore[0], targetNotebook[0], unreadDigestFilter[0]));
      });
    });

    graph.readNotesMetadataProvider = pitcher.promisedProvider(graph.readNotesMetadataProvider)((resolve, reject) => {
      var noteStore = graph.noteStoreProvider.get();
      var readDigestFilter = graph.readDigestFilterProvider.get();

      pitcher.awaitAll([noteStore[2],readDigestFilter[2]], (_, err) => {
        err ? reject(err) : resolve(this.providesReadNotesMetadata(noteStore[0], readDigestFilter[0]));
      });
    });

    graph.randomNoteFinderProvider = pitcher.singletonProvider(graph.randomNoteFinderProvider)((resolve, reject) => {
      var noteStore = graph.noteStoreProvider.get();
      var sourceNotebooks = graph.sourceNotebooksProvider.get();
      var rand = graph.randProvider.get();

      pitcher.awaitAll([noteStore[2],sourceNotebooks[2],rand[2]], (_, err) => {
        err ? reject(err) : resolve(() => {
          return this.providesRandomNoteFinder(noteStore[0], sourceNotebooks[0], rand[0]);
        });
      });
    });

    graph.newDigestNotesProvider = pitcher.promisedProvider(graph.newDigestNotesProvider)((resolve, reject) => {
      var noteStore = graph.noteStoreProvider.get();
      var randomNoteFinder = graph.randomNoteFinderProvider.get();
      var digestSize = graph.digestSizeProvider.get();
      var unreadNoteCount = graph.unreadNoteCountProvider.get();

      pitcher.awaitAll([noteStore[2],randomNoteFinder[2],digestSize[2],unreadNoteCount[2]], (_, err) => {
        err ? reject(err) : resolve(this.providesNewDigestNotes(noteStore[0], randomNoteFinder[0], digestSize[0], unreadNoteCount[0]));
      });
    });

    graph.sourceNotebooksProvider = pitcher.singletonProvider(graph.sourceNotebooksProvider)((resolve, reject) => {
      var notebooksList = graph.notebooksListProvider.get();
      var parsedCommandLine = graph.parsedCommandLineProvider.get();
      var config = graph.configProvider.get();

      pitcher.awaitAll([notebooksList[2],parsedCommandLine[2],config[2]], (_, err) => {
        err ? reject(err) : resolve(this.providesSourceNotebooks(notebooksList[0], parsedCommandLine[0], config[0]));
      });
    });

    graph.targetNotebookProvider = pitcher.promisedProvider(graph.targetNotebookProvider)((resolve, reject) => {
      var noteStore = graph.noteStoreProvider.get();
      var notebooksList = graph.notebooksListProvider.get();
      var defaultTargetNotebook = graph.defaultTargetNotebookProvider.get();
      var config = graph.configProvider.get();

      pitcher.awaitAll([noteStore[2],notebooksList[2],defaultTargetNotebook[2],config[2]], (_, err) => {
        err ? reject(err) : resolve(this.providesTargetNotebook(noteStore[0], notebooksList[0], defaultTargetNotebook[0], config[0]));
      });
    });
  }
}


export class InferredModuleGraph {
  digestSizeProvider = pitcher.typeOfGiven(Module.prototype.providedDigestSize);
  isSandboxProvider = pitcher.typeOfGiven(Module.prototype.providedIsSandbox);
  clientProvider = pitcher.typeOfProvider(Module.prototype.providesClient);
  userStoreProvider = pitcher.typeOfProvider(Module.prototype.providesUserStore);
  noteStoreProvider = pitcher.typeOfProvider(Module.prototype.providesNoteStore);
  userProvider = pitcher.typeOfProviderPromised(Module.prototype.providesUser);
  defaultTargetNotebookProvider = pitcher.typeOfProvider(Module.prototype.providesDefaultTargetNotebook);
  notebooksListProvider = pitcher.typeOfProviderPromised(Module.prototype.providesNotebooksList);
  unreadDigestFilterProvider = pitcher.typeOfProvider(Module.prototype.providesUnreadDigestFilter);
  readDigestFilterProvider = pitcher.typeOfProvider(Module.prototype.providesReadDigestFilter);
  unreadNoteCountProvider = pitcher.typeOfProviderPromised(Module.prototype.providesUnreadNoteCount);
  readNotesMetadataProvider = pitcher.typeOfProviderPromised(Module.prototype.providesReadNotesMetadata);
  randomNoteFinderProvider = pitcher.typeOfFactoryMethod(Module.prototype.providesRandomNoteFinder);
  newDigestNotesProvider = pitcher.typeOfProviderPromised(Module.prototype.providesNewDigestNotes);
  sourceNotebooksProvider = pitcher.typeOfProvider(Module.prototype.providesSourceNotebooks);
  targetNotebookProvider = pitcher.typeOfProviderPromised(Module.prototype.providesTargetNotebook);
}

export interface ModuleGraph extends InferredModuleGraph, config.ModuleGraph, random.ModuleGraph { }
