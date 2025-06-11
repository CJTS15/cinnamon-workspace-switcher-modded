
# Workspace Switcher Modded

This Cinnamon applet replaces the default workspace switcher, offering enhanced functionality including workspace renaming and dynamic sizing of workspace buttons to fit their content.

## Demo

![Demo](assets/demo.gif)

## Installation

*   **Clone this repository:** Clone this repository on your Downloads directory.
```
cd Downloads
git clone git@github.com:CJTS15/cinnamon-workspace-switcher-modded.git
```
*   **Add to applets folder:** Move the cloned repository from Downloads folder to ~/.local/share/cinnamon/applets/
```
sudo mv cinnamon-workspace-switcher-modded/files/workspace-switcher-modded@CJTS15/ ~/.local/share/cinnamon/applets/
```
*   **Enable the applet:** Go to Settings>Applets. Select the Workspace Switcher Modded. That's it.

## Features

*   **Replaces Default Switcher:** Provides a modern, customizable workspace switching experience.
*   **Visual or Simple Display:** Supports both graphical representation of workspaces (showing window outlines) and simple numbered/named buttons.
*   **Mouse Scroll Switching:** Navigate between workspaces using your mouse scroll wheel over the applet.
*   **Rename Workspaces:** Right-click on the applet and select "Rename current workspace" to give your workspaces custom names.
*   **Dynamic Button Width:** Workspace buttons automatically adjust their width to fit the length of their names.
*   **Add/Remove Workspaces:** Quick access to add new workspaces or remove the current one via the context menu.
*   **Expo Mode Access:** Easily toggle Cinnamon's Expo (overview) mode from the applet's context menu.

## Usage

*   **Switch Workspaces:** Left-click on a workspace button to switch to it.
*   **Scroll Switching:** Hover your mouse over the applet and scroll up/down to navigate workspaces.
*   **Rename Workspace:** Right-click on the applet and select "Rename current workspace". A dialog will appear where you can type the new name.
*   **Add/Remove Workspaces:** Right-click the applet and use "Add a new workspace" or "Remove the current workspace".
*   **Expo Mode:** Right-click the applet and select "Manage workspaces (Expo)".

## Credits

*   **Workspace Switcher:** by [workspace-switcher@cinnamon.org](https://cinnamon-spices.linuxmint.com/)
*   **Workspace Name:** by [workspace-name@willurd](https://cinnamon-spices.linuxmint.com/applets/view/222)


