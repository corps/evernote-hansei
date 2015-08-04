import pitcher = require("pitcher");
import commander = require("commander");

export interface CommandLineOption {
  short: string
  long: string
  argName?: string
  description?: string
}

export var _commander = new commander.Command();
export type Commander = typeof _commander;

export class Module implements pitcher.Builds<ModuleGraph> {
  contributedCommandLineOptions: CommandLineOption[] = [];

  providesCommandLine(commandLineOptions: CommandLineOption[]) {
    var commandLine = new commander.Command();
    commandLineOptions.forEach((o) => {
      var argPart = o.argName ? ` <${o.argName}>` : "";
      commandLine.option(`-${o.short}, --${o.long}${argPart}`, o.description);
    })
    return commandLine;
  }

  providedArgv = process.argv;

  providesParsedCommandLine(argv: string[], commandLine: Commander) {
    return commandLine.parse(argv);
  }

  providesOpts(parsedCommandLine: Commander) {
    return parsedCommandLine.opts();
  }

  install(graph: ModuleGraph, installed: pitcher.InstalledModules, override: boolean) {
    var moduleIdentity = pitcher.identifyModuleBase(this);
    if (!override && installed[moduleIdentity]) return;

    installed[moduleIdentity] = true;


    graph.commandLineOptionsCollection = graph.commandLineOptionsCollection || [];
    graph.commandLineOptionsCollection.push(pitcher.singletonProvider(graph.commandLineOptionsProvider)((resolve) =>resolve(this.contributedCommandLineOptions)));
    if (graph.commandLineOptionsProvider == null) graph.commandLineOptionsProvider = pitcher.collectionProvider(graph.commandLineOptionsProvider)(graph.commandLineOptionsCollection);

    graph.commandLineProvider = pitcher.singletonProvider(graph.commandLineProvider)((resolve, reject) => {
      var commandLineOptions = graph.commandLineOptionsProvider.get();

      pitcher.awaitAll([commandLineOptions[2]], (_, err) => {
        err ? reject(err) : resolve(this.providesCommandLine(commandLineOptions[0]));
      });
    });

    graph.argvProvider = pitcher.singletonProvider(graph.argvProvider)((resolve) =>resolve(this.providedArgv));

    graph.parsedCommandLineProvider = pitcher.singletonProvider(graph.parsedCommandLineProvider)((resolve, reject) => {
      var argv = graph.argvProvider.get();
      var commandLine = graph.commandLineProvider.get();

      pitcher.awaitAll([argv[2],commandLine[2]], (_, err) => {
        err ? reject(err) : resolve(this.providesParsedCommandLine(argv[0], commandLine[0]));
      });
    });

    graph.optsProvider = pitcher.singletonProvider(graph.optsProvider)((resolve, reject) => {
      var parsedCommandLine = graph.parsedCommandLineProvider.get();

      pitcher.awaitAll([parsedCommandLine[2]], (_, err) => {
        err ? reject(err) : resolve(this.providesOpts(parsedCommandLine[0]));
      });
    });
  }
}


export class InferredModuleGraph {
  commandLineOptionsProvider = pitcher.typeOfGiven(Module.prototype.contributedCommandLineOptions);
  commandLineOptionsCollection = pitcher.collectionTypeOfGiven(Module.prototype.contributedCommandLineOptions);
  commandLineProvider = pitcher.typeOfProvider(Module.prototype.providesCommandLine);
  argvProvider = pitcher.typeOfGiven(Module.prototype.providedArgv);
  parsedCommandLineProvider = pitcher.typeOfProvider(Module.prototype.providesParsedCommandLine);
  optsProvider = pitcher.typeOfProvider(Module.prototype.providesOpts);
}

export interface ModuleGraph extends InferredModuleGraph {}
