"""Run native folder dialogs in a separate process, away from server threads."""
import subprocess
import sys


def choose_folder():
    if sys.platform == 'darwin':
        script = 'tell application "Finder"\nactivate\ntry\nreturn POSIX path of (choose folder with prompt "Open a StarView project folder")\non error number -128\nreturn ""\nend try\nend tell'
        command = ['osascript', '-e', script]
    elif sys.platform == 'win32':
        script = 'Add-Type -AssemblyName System.Windows.Forms; $dialog = New-Object System.Windows.Forms.FolderBrowserDialog; $dialog.Description = "Open a StarView project folder"; if ($dialog.ShowDialog() -eq "OK") { $dialog.SelectedPath }'
        command = ['powershell', '-NoProfile', '-STA', '-Command', script]
    else:
        script = 'import tkinter as tk; from tkinter import filedialog; root=tk.Tk(); root.withdraw(); print(filedialog.askdirectory(title="Open a StarView project folder")); root.destroy()'
        command = [sys.executable, '-c', script]
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=300)
    except (OSError, subprocess.TimeoutExpired) as error:
        raise RuntimeError('Could not open the native folder picker. Use Browse folders instead.') from error
    if result.returncode:
        raise RuntimeError('Could not open the native folder picker. Use Browse folders instead.')
    return result.stdout.strip() or None
