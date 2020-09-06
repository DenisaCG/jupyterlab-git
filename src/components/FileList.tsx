import { Dialog, showDialog, showErrorMessage } from '@jupyterlab/apputils';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { CommandRegistry } from '@lumino/commands';
import { Menu } from '@lumino/widgets';
import * as React from 'react';
import { CommandIDs } from '../commandsAndMenu';
import { GitExtension } from '../model';
import { hiddenButtonStyle } from '../style/ActionButtonStyle';
import { fileListWrapperClass } from '../style/FileListStyle';
import {
  addIcon,
  diffIcon,
  discardIcon,
  openIcon,
  removeIcon
} from '../style/icons';
import { Git } from '../tokens';
import { ActionButton } from './ActionButton';
import { isDiffSupported } from './diff/Diff';
import { FileItem } from './FileItem';
import { GitStage } from './GitStage';

export interface IFileListState {
  selectedFile: Git.IStatusFile | null;
}

export interface IFileListProps {
  /**
   * Modified files
   */
  files: Git.IStatusFile[];
  /**
   * Git extension model
   */
  model: GitExtension;
  /**
   * Jupyter App commands registry
   */
  commands: CommandRegistry;
  /**
   * Extension settings
   */
  settings: ISettingRegistry.ISettings;
}

export class FileList extends React.Component<IFileListProps, IFileListState> {
  constructor(props: IFileListProps) {
    super(props);

    this.state = {
      selectedFile: null
    };
  }

  /**
   * Open the context menu on the advanced view
   *
   * @param selectedFile The file on which the context menu is opened
   * @param event The click event
   */
  openContextMenu = (
    selectedFile: Git.IStatusFile,
    event: React.MouseEvent
  ) => {
    event.preventDefault();

    this.setState({
      selectedFile
    });

    const contextMenu = new Menu({ commands: this.props.commands });
    const commands = [CommandIDs.gitFileOpen];
    switch (selectedFile.status) {
      case 'unstaged':
        commands.push(
          CommandIDs.gitFileStage,
          CommandIDs.gitFileDiscard,
          CommandIDs.gitFileDiff
        );
        break;
      case 'untracked':
        commands.push(
          CommandIDs.gitFileTrack,
          CommandIDs.gitIgnore,
          CommandIDs.gitIgnoreExtension
        );
        break;
      case 'staged':
        commands.push(CommandIDs.gitFileUnstage, CommandIDs.gitFileDiff);
        break;
    }

    commands.forEach(command => {
      contextMenu.addItem({ command, args: selectedFile as any });
    });
    contextMenu.open(event.clientX, event.clientY);
  };

  /**
   * Open the context menu on the simple view
   *
   * @param selectedFile The file on which the context menu is opened
   * @param event The click event
   */
  openSimpleContextMenu = (
    selectedFile: Git.IStatusFile,
    event: React.MouseEvent
  ) => {
    event.preventDefault();

    const contextMenu = new Menu({ commands: this.props.commands });
    const commands = [CommandIDs.gitFileOpen];
    switch (selectedFile.status) {
      case 'untracked':
        commands.push(CommandIDs.gitIgnore, CommandIDs.gitIgnoreExtension);
        break;
      default:
        commands.push(CommandIDs.gitFileDiscard, CommandIDs.gitFileDiff);
        break;
    }

    commands.forEach(command => {
      if (command === CommandIDs.gitFileDiff) {
        contextMenu.addItem({
          command,
          args: {
            filePath: selectedFile.to,
            isText: !selectedFile.is_binary,
            status: selectedFile.status
          }
        });
      } else {
        contextMenu.addItem({ command, args: selectedFile as any });
      }
    });
    contextMenu.open(event.clientX, event.clientY);
  };

  /** Reset all staged files */
  resetAllStagedFiles = async () => {
    await this.props.model.reset();
  };

  /** Reset a specific staged file */
  resetStagedFile = async (file: string) => {
    await this.props.model.reset(file);
  };

  /** Add all unstaged files */
  addAllUnstagedFiles = async () => {
    await this.props.model.addAllUnstaged();
  };

  /** Discard changes in all unstaged files */
  discardAllUnstagedFiles = async () => {
    const result = await showDialog({
      title: 'Discard all changes',
      body:
        'Are you sure you want to permanently discard changes to all files? This action cannot be undone.',
      buttons: [Dialog.cancelButton(), Dialog.warnButton({ label: 'Discard' })]
    });
    if (result.button.accept) {
      try {
        await this.props.model.checkout();
      } catch (reason) {
        showErrorMessage('Discard all unstaged changes failed.', reason);
      }
    }
  };

  /** Discard changes in all unstaged and staged files */
  discardAllChanges = async () => {
    const result = await showDialog({
      title: 'Discard all changes',
      body:
        'Are you sure you want to permanently discard changes to all files? This action cannot be undone.',
      buttons: [Dialog.cancelButton(), Dialog.warnButton({ label: 'Discard' })]
    });
    if (result.button.accept) {
      try {
        await this.props.model.resetToCommit();
      } catch (reason) {
        showErrorMessage('Discard all changes failed.', reason);
      }
    }
  };

  /** Add a specific unstaged file */
  addFile = async (...file: string[]) => {
    await this.props.model.add(...file);
  };

  /** Discard changes in a specific unstaged or staged file */
  discardChanges = async (file: Git.IStatusFile) => {
    await this.props.commands.execute(CommandIDs.gitFileDiscard, file as any);
  };

  /** Add all untracked files */
  addAllUntrackedFiles = async () => {
    await this.props.model.addAllUntracked();
  };

  addAllMarkedFiles = async () => {
    await this.addFile(...this.markedFiles.map(file => file.to));
  };

  updateSelectedFile = (file: Git.IStatusFile | null) => {
    this.setState({ selectedFile: file });
  };

  get markedFiles() {
    return this.props.files.filter(file => this.props.model.getMark(file.to));
  }

  render() {
    if (this.props.settings.composite['simpleStaging']) {
      return (
        <div className={fileListWrapperClass}>
          {this._renderSimpleStage(this.props.files)}
        </div>
      );
    } else {
      const stagedFiles: Git.IStatusFile[] = [];
      const unstagedFiles: Git.IStatusFile[] = [];
      const untrackedFiles: Git.IStatusFile[] = [];

      this.props.files.forEach(file => {
        switch (file.status) {
          case 'staged':
            stagedFiles.push(file);
            break;
          case 'unstaged':
            unstagedFiles.push(file);
            break;
          case 'untracked':
            untrackedFiles.push(file);
            break;
          case 'partially-staged':
            stagedFiles.push({
              ...file,
              status: 'staged'
            });
            unstagedFiles.push({
              ...file,
              status: 'unstaged'
            });
            break;

          default:
            break;
        }
      });

      return (
        <div
          className={fileListWrapperClass}
          onContextMenu={event => event.preventDefault()}
        >
          {this._renderStaged(stagedFiles)}
          {this._renderChanged(unstagedFiles)}
          {this._renderUntracked(untrackedFiles)}
        </div>
      );
    }
  }

  private _isSelectedFile(candidate: Git.IStatusFile): boolean {
    if (this.state.selectedFile === null) {
      return false;
    }

    return (
      this.state.selectedFile.x === candidate.x &&
      this.state.selectedFile.y === candidate.y &&
      this.state.selectedFile.from === candidate.from &&
      this.state.selectedFile.to === candidate.to &&
      this.state.selectedFile.status === candidate.status
    );
  }

  private _renderStaged(files: Git.IStatusFile[]) {
    const doubleClickDiff = this.props.settings.get('doubleClickDiff')
      .composite as boolean;
    return (
      <GitStage
        actions={
          <ActionButton
            className={hiddenButtonStyle}
            disabled={files.length === 0}
            icon={removeIcon}
            title={'Unstage all changes'}
            onClick={this.resetAllStagedFiles}
          />
        }
        collapsible
        heading={'Staged'}
        nFiles={files.length}
      >
        {files.map((file: Git.IStatusFile) => {
          const openFile = () => {
            this.props.commands.execute(CommandIDs.gitFileOpen, file as any);
          };
          const diffButton = this._createDiffButton(file);
          return (
            <FileItem
              key={file.to}
              actions={
                <React.Fragment>
                  <ActionButton
                    className={hiddenButtonStyle}
                    icon={openIcon}
                    title={'Open this file'}
                    onClick={openFile}
                  />
                  {diffButton}
                  <ActionButton
                    className={hiddenButtonStyle}
                    icon={removeIcon}
                    title={'Unstage this change'}
                    onClick={() => {
                      this.resetStagedFile(file.to);
                    }}
                  />
                </React.Fragment>
              }
              file={file}
              contextMenu={this.openContextMenu}
              model={this.props.model}
              selected={this._isSelectedFile(file)}
              selectFile={this.updateSelectedFile}
              onDoubleClick={
                doubleClickDiff
                  ? diffButton
                    ? () => this._openDiffView(file)
                    : () => undefined
                  : openFile
              }
            />
          );
        })}
      </GitStage>
    );
  }

  private _renderChanged(files: Git.IStatusFile[]) {
    const doubleClickDiff = this.props.settings.get('doubleClickDiff')
      .composite as boolean;
    const disabled = files.length === 0;
    return (
      <GitStage
        actions={
          <React.Fragment>
            <ActionButton
              className={hiddenButtonStyle}
              disabled={disabled}
              icon={discardIcon}
              title={'Discard All Changes'}
              onClick={this.discardAllUnstagedFiles}
            />
            <ActionButton
              className={hiddenButtonStyle}
              disabled={disabled}
              icon={addIcon}
              title={'Stage all changes'}
              onClick={this.addAllUnstagedFiles}
            />
          </React.Fragment>
        }
        collapsible
        heading={'Changed'}
        nFiles={files.length}
      >
        {files.map((file: Git.IStatusFile) => {
          const openFile = () => {
            this.props.commands.execute(CommandIDs.gitFileOpen, file as any);
          };
          const diffButton = this._createDiffButton(file);
          return (
            <FileItem
              key={file.to}
              actions={
                <React.Fragment>
                  <ActionButton
                    className={hiddenButtonStyle}
                    icon={openIcon}
                    title={'Open this file'}
                    onClick={openFile}
                  />
                  {diffButton}
                  <ActionButton
                    className={hiddenButtonStyle}
                    icon={discardIcon}
                    title={'Discard changes'}
                    onClick={() => {
                      this.discardChanges(file);
                    }}
                  />
                  <ActionButton
                    className={hiddenButtonStyle}
                    icon={addIcon}
                    title={'Stage this change'}
                    onClick={() => {
                      this.addFile(file.to);
                    }}
                  />
                </React.Fragment>
              }
              file={file}
              contextMenu={this.openContextMenu}
              model={this.props.model}
              selected={this._isSelectedFile(file)}
              selectFile={this.updateSelectedFile}
              onDoubleClick={
                doubleClickDiff
                  ? diffButton
                    ? () => this._openDiffView(file)
                    : () => undefined
                  : openFile
              }
            />
          );
        })}
      </GitStage>
    );
  }

  private _renderUntracked(files: Git.IStatusFile[]) {
    const doubleClickDiff = this.props.settings.get('doubleClickDiff')
      .composite as boolean;
    return (
      <GitStage
        actions={
          <ActionButton
            className={hiddenButtonStyle}
            disabled={files.length === 0}
            icon={addIcon}
            title={'Track all untracked files'}
            onClick={this.addAllUntrackedFiles}
          />
        }
        collapsible
        heading={'Untracked'}
        nFiles={files.length}
      >
        {files.map((file: Git.IStatusFile) => {
          return (
            <FileItem
              key={file.to}
              actions={
                <React.Fragment>
                  <ActionButton
                    className={hiddenButtonStyle}
                    icon={openIcon}
                    title={'Open this file'}
                    onClick={() => {
                      this.props.commands.execute(
                        CommandIDs.gitFileOpen,
                        file as any
                      );
                    }}
                  />
                  <ActionButton
                    className={hiddenButtonStyle}
                    icon={addIcon}
                    title={'Track this file'}
                    onClick={() => {
                      this.addFile(file.to);
                    }}
                  />
                </React.Fragment>
              }
              file={file}
              contextMenu={this.openContextMenu}
              model={this.props.model}
              onDoubleClick={() => {
                if (!doubleClickDiff) {
                  this.props.commands.execute(
                    CommandIDs.gitFileOpen,
                    file as any
                  );
                }
              }}
              selected={this._isSelectedFile(file)}
              selectFile={this.updateSelectedFile}
            />
          );
        })}
      </GitStage>
    );
  }

  private _renderSimpleStage(files: Git.IStatusFile[]) {
    const doubleClickDiff = this.props.settings.get('doubleClickDiff')
      .composite as boolean;
    return (
      <GitStage
        actions={
          <ActionButton
            className={hiddenButtonStyle}
            disabled={files.length === 0}
            icon={discardIcon}
            title={'Discard All Changes'}
            onClick={this.discardAllChanges}
          />
        }
        heading={'Changed'}
        nFiles={files.length}
      >
        {files.map((file: Git.IStatusFile) => {
          const openFile = () => {
            this.props.commands.execute(CommandIDs.gitFileOpen, file as any);
          };

          // Default value for actions and double click
          let actions: JSX.Element = (
            <ActionButton
              className={hiddenButtonStyle}
              icon={openIcon}
              title={'Open this file'}
              onClick={openFile}
            />
          );
          let onDoubleClick = doubleClickDiff
            ? (): void => undefined
            : openFile;

          if (
            file.status === 'unstaged' ||
            file.status === 'partially-staged'
          ) {
            const diffButton = this._createDiffButton(file);
            actions = (
              <React.Fragment>
                <ActionButton
                  className={hiddenButtonStyle}
                  icon={openIcon}
                  title={'Open this file'}
                  onClick={openFile}
                />
                {diffButton}
                <ActionButton
                  className={hiddenButtonStyle}
                  icon={discardIcon}
                  title={'Discard changes'}
                  onClick={() => {
                    this.discardChanges(file);
                  }}
                />
              </React.Fragment>
            );
            onDoubleClick = doubleClickDiff
              ? diffButton
                ? () => this._openDiffView(file)
                : () => undefined
              : openFile;
          } else if (file.status === 'staged') {
            const diffButton = this._createDiffButton(file);
            actions = (
              <React.Fragment>
                <ActionButton
                  className={hiddenButtonStyle}
                  icon={openIcon}
                  title={'Open this file'}
                  onClick={openFile}
                />
                {diffButton}
                <ActionButton
                  className={hiddenButtonStyle}
                  icon={discardIcon}
                  title={'Discard changes'}
                  onClick={() => {
                    this.discardChanges(file);
                  }}
                />
              </React.Fragment>
            );
            onDoubleClick = doubleClickDiff
              ? diffButton
                ? () => this._openDiffView(file)
                : () => undefined
              : openFile;
          }

          return (
            <FileItem
              key={file.to}
              actions={actions}
              file={file}
              markBox={true}
              model={this.props.model}
              onDoubleClick={onDoubleClick}
              contextMenu={this.openSimpleContextMenu}
              selectFile={this.updateSelectedFile}
            />
          );
        })}
      </GitStage>
    );
  }

  /**
   * Creates a button element which, depending on the settings, is used
   * to either request a diff of the file, or open the file
   *
   * @param path File path of interest
   * @param currentRef the ref to diff against the git 'HEAD' ref
   */
  private _createDiffButton(file: Git.IStatusFile): JSX.Element {
    return (
      (isDiffSupported(file.to) || !file.is_binary) && (
        <ActionButton
          className={hiddenButtonStyle}
          icon={diffIcon}
          title={'Diff this file'}
          onClick={() => this._openDiffView(file)}
        />
      )
    );
  }

  /**
   * Returns a callback which opens a diff of the file
   *
   * @param file File to open diff for
   * @param currentRef the ref to diff against the git 'HEAD' ref
   */
  private async _openDiffView(file: Git.IStatusFile): Promise<void> {
    try {
      await this.props.commands.execute(CommandIDs.gitFileDiff, {
        filePath: file.to,
        isText: !file.is_binary,
        status: file.status
      });
    } catch (reason) {
      console.error(`Failed to open diff view for ${file.to}.\n${reason}`);
    }
  }
}
