import {exec} from 'child_process';
import * as crypto from 'crypto';
import * as vscode from 'vscode';

// Định nghĩa kiểu dữ liệu cho Git Profile
interface GitProfile {
  label: string;
  email: string;
  userName: string;
  selected: boolean;
  id: string;
  signingKey: string;
}

export function activate(context: vscode.ExtensionContext) {
  // Tạo Status Bar Item bên trái
  const statusBar =
      vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBar.command = 'gitUserManager.manageProfiles';  // Liên kết lệnh khi
                                                        // click vào Status Bar
  context.subscriptions.push(statusBar);

  // Cập nhật Status Bar khi extension kích hoạt
  updateStatusBar(statusBar);

  // Đăng ký lệnh quản lý profiles
  const manageProfilesCommand = vscode.commands.registerCommand(
      'gitUserManager.manageProfiles', () => manageProfiles(statusBar));
  context.subscriptions.push(manageProfilesCommand);
}

export function deactivate() {}

// Hàm đọc Git profiles từ settings.json
function getGitProfiles(): GitProfile[] {
  const config = vscode.workspace.getConfiguration();
  return config.get<GitProfile[]>('gitUserManager.profiles') || [];
}

// Hàm ghi Git profiles vào settings.json
async function saveGitProfiles(profiles: GitProfile[]) {
  const config = vscode.workspace.getConfiguration();
  await config.update(
      'gitUserManager.profiles', profiles, vscode.ConfigurationTarget.Global);
}

// Hàm cập nhật Status Bar
function updateStatusBar(statusBar: vscode.StatusBarItem) {
  const profiles = getGitProfiles();
  const selectedProfile = profiles.find(profile => profile.selected);

  if (selectedProfile) {
    statusBar.text =
        `$(mark-github) ${selectedProfile.userName} <${selectedProfile.email}>`;
    statusBar.tooltip =
        `Git User: ${selectedProfile.userName} <${selectedProfile.email}>`;
    setGitUser(
        selectedProfile.userName, selectedProfile.email,
        selectedProfile.signingKey);
  } else {
    statusBar.text = `$(mark-github) Set Git User`;
    statusBar.tooltip = `Set Git User`;
  }

  statusBar.show();
}

// Hàm quản lý profiles khi click vào Status Bar
async function manageProfiles(statusBar: vscode.StatusBarItem) {
  const options = [
    {
      label: '$(add) Add New Git Profile',
      description: 'Create a new Git profile',
      action: 'add'
    },
    {
      label: '$(list-flat) Select Existing Git Profile',
      description: 'Choose a Git profile from the list',
      action: 'select'
    },
    {
      label: '$(list-flat) Commit',
      description: 'CCommit with convention',
      action: 'commit'
    }
  ];

  const selected = await vscode.window.showQuickPick(
      options, {placeHolder: 'Manage Git Profiles'});

  if (!selected) {
    return;
  }

  if (selected.action === 'add') {
    await addNewGitProfile(statusBar);
  } else if (selected.action === 'select') {
    await selectExistingGitProfile(statusBar);
  } else if (selected.action === 'commit') {
    // Call another extension's command
    vscode.commands.executeCommand('extension.conventionalCommits');
  }
}

// Hàm thêm Git profile mới
async function addNewGitProfile(statusBar: vscode.StatusBarItem) {
  const label = await vscode.window.showInputBox(
      {prompt: 'Enter profile label (e.g., "Work" or "Personal")'});
  if (!label) return;

  const userName =
      await vscode.window.showInputBox({prompt: 'Enter Git user name'});
  if (!userName) return;

  const email = await vscode.window.showInputBox({prompt: 'Enter Git email'});
  if (!email) return;

  const signingKey = await vscode.window.showInputBox(
      {prompt: 'Enter signing key (optional)'});

  const id = crypto.randomUUID();
  const profiles = getGitProfiles();

  // Đánh dấu tất cả các profile khác là không selected
  profiles.forEach(profile => profile.selected = false);

  // Thêm profile mới và đánh dấu là selected
  profiles.push({
    label,
    email,
    userName,
    selected: true,
    id,
    signingKey: signingKey || '',
  });

  await saveGitProfiles(profiles);
  updateStatusBar(statusBar);

  await setGitUser(userName, email, signingKey);

  vscode.window.showInformationMessage(`Added and set Git profile: ${label}`);
}

// Hàm chọn Git profile đã tồn tại
async function selectExistingGitProfile(statusBar: vscode.StatusBarItem) {
  const profiles = getGitProfiles();
  if (profiles.length === 0) {
    vscode.window.showInformationMessage(
        'No profiles available. Please add one first.');
    return;
  }

  const choices =
      profiles.map(profile => ({
                     label: profile.label,
                     description: `${profile.userName} <${profile.email}>`,
                     profile
                   }));

  const selected = await vscode.window.showQuickPick(
      choices, {placeHolder: 'Select a Git profile'});

  if (!selected) return;

  const profile = selected.profile;

  const updatedProfiles =
      profiles.map(p => ({...p, selected: p.id === profile.id}));

  await saveGitProfiles(updatedProfiles);
  updateStatusBar(statusBar);

  await setGitUser(profile.userName, profile.email, profile.signingKey);

  vscode.window.showInformationMessage(
      `Selected Git profile: ${profile.label}`);
}

// Hàm đặt Git global user
async function setGitUser(
    userName: string, email: string, signingKey?: string) {
  return new Promise<void>((resolve, reject) => {
    exec(
        `git config --global user.name "${userName}"`,
        (err, stdout, stderr) => {
          if (err) {
            vscode.window.showErrorMessage(
                `Failed to set user.name: ${stderr}`);
            return reject(err);
          }

          exec(
              `git config --global user.email "${email}"`,
              (err, stdout, stderr) => {
                if (err) {
                  vscode.window.showErrorMessage(
                      `Failed to set user.email: ${stderr}`);
                  return reject(err);
                }

                if (signingKey) {
                  exec(
                      `git config --global user.signingkey "${signingKey}"`,
                      (err, stdout, stderr) => {
                        if (err) {
                          vscode.window.showErrorMessage(
                              `Failed to set signing key: ${stderr}`);
                          return reject(err);
                        }
                        vscode.window.showInformationMessage(
                            `Git global user set to: ${userName} <${email}>`);
                        resolve();
                      });
                } else {
                  vscode.window.showInformationMessage(
                      `Git global user set to: ${userName} <${email}>`);
                  resolve();
                }
              });
        });
  });
}
