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

export class Module implements pitcher.Module {
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
}
