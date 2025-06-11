const St = imports.gi.St;
const Clutter = imports.gi.Clutter;
const Lang = imports.lang;
const Applet = imports.ui.applet;
const Main = imports.ui.main;
const Mainloop = imports.mainloop;
const Meta = imports.gi.Meta;
const PopupMenu = imports.ui.popupMenu;
const SignalManager = imports.misc.signalManager;
const Tooltips = imports.ui.tooltips;
const Settings = imports.ui.settings;
const ModalDialog = imports.ui.modalDialog;
const Pango = imports.gi.Pango;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;

const MIN_SWITCH_INTERVAL_MS = 220;

class WorkspaceButton {
    constructor(index, applet) {
        this.index = index;
        this.applet = applet;
        this.workspace = global.workspace_manager.get_workspace_by_index(this.index);
        this.workspace_name = Main.getWorkspaceName(index);
        this.actor = null;

        this.ws_signals = new SignalManager.SignalManager(null);

        this.ws_signals.connect(this.workspace, "window-added", this.update, this);
        this.ws_signals.connect(this.workspace, "window-removed", this.update, this);

        this.ws_signals.connect_after(Main.wmSettings, "changed::workspace-names", this.updateName, this);
    }

    show() {
        this.actor.connect('button-release-event', Lang.bind(this, this.onClicked));
        this._tooltip = new Tooltips.PanelItemTooltip(this, this.workspace_name, this.applet.orientation);
        if (this.index === global.workspace_manager.get_active_workspace_index()) {
            this.activate(true);
        }
    }

    updateName() {
        this.workspace_name = Main.getWorkspaceName(this.index);
        this._tooltip.set_text(this.workspace_name);
    }

    onClicked(actor, event) {
        if (event.get_button() == 1) {
            Main.wm.moveToWorkspace(this.workspace);
        } else if (event.get_button() == 2) {
            removeWorkspaceAtIndex(this.index);
        }
    }

    update() {
        // defined in subclass
    }

    activate(active) {
        // Defined in subclass
    }

    destroy() {
        this.ws_signals.disconnectAllSignals();
        this._tooltip.destroy();
        this.actor.destroy();
    }
}

class WorkspaceGraph extends WorkspaceButton {
    constructor(index, applet) {
        super(index, applet);

        this.scaleFactor = 0;

        this.actor = new St.Bin({ reactive: applet._draggable.inhibit,
                                  style_class: 'workspace',
                                  y_fill: true,
                                  important: true });

        this.graphArea = new St.DrawingArea({ style_class: 'windows', important: true });
        this.actor.add_actor(this.graphArea);
        this.panelApplet = applet;

        this.graphArea.set_size(1, 1);
        this.graphArea.connect('repaint', Lang.bind(this, this.onRepaint));
    }

    getSizeAdjustment (actor, vertical) {
        let themeNode = actor.get_theme_node()
        if (vertical) {
            return themeNode.get_horizontal_padding() +
                themeNode.get_border_width(St.Side.LEFT) +
                themeNode.get_border_width(St.Side.RIGHT);
        }
        else {
            return themeNode.get_vertical_padding() +
                themeNode.get_border_width(St.Side.TOP) +
                themeNode.get_border_width(St.Side.BOTTOM);
        }
    }

    setGraphSize () {
        this.workspace_size = this.workspace.get_work_area_all_monitors();

        let height, width;
        if (this.panelApplet.orientation == St.Side.LEFT ||
            this.panelApplet.orientation == St.Side.RIGHT) {

            width = this.panelApplet._panelHeight -
                this.getSizeAdjustment(this.panelApplet.actor, true) -
                this.getSizeAdjustment(this.actor, true);
            this.scaleFactor = this.workspace_size.width / width;
            height = Math.round(this.workspace_size.height / this.scaleFactor);
        }
        else {
            height = this.panelApplet._panelHeight -
                this.getSizeAdjustment(this.panelApplet.actor, false) -
                this.getSizeAdjustment(this.actor, false);
            this.scaleFactor = this.workspace_size.height / height;
            width = Math.round(this.workspace_size.width / this.scaleFactor);
        }

        this.graphArea.set_size(width, height);
    }

    scale (windows_rect, workspace_rect) {
        let scaled_rect = new Meta.Rectangle();
        scaled_rect.x = Math.round((windows_rect.x - workspace_rect.x) / this.scaleFactor);
        scaled_rect.y = Math.round((windows_rect.y - workspace_rect.y) / this.scaleFactor);
        scaled_rect.width = Math.round(windows_rect.width / this.scaleFactor);
        scaled_rect.height = Math.round(windows_rect.height / this.scaleFactor);
        return scaled_rect;
    }

    sortWindowsByUserTime (win1, win2) {
        let t1 = win1.get_user_time();
        let t2 = win2.get_user_time();
        return (t2 < t1) ? 1 : -1;
    }

    paintWindow(metaWindow, themeNode, cr) {
        let windowBackgroundColor;
        let windowBorderColor;

        let scaled_rect = this.scale(metaWindow.get_buffer_rect(), this.workspace_size);

        if (metaWindow.has_focus()) {
            windowBorderColor = themeNode.get_color('-active-window-border');
            windowBackgroundColor = themeNode.get_color('-active-window-background');
        } else {
            windowBorderColor = themeNode.get_color('-inactive-window-border');
            windowBackgroundColor = themeNode.get_color('-inactive-window-background');
        }

        Clutter.cairo_set_source_color(cr, windowBorderColor);
        cr.rectangle(scaled_rect.x, scaled_rect.y, scaled_rect.width, scaled_rect.height);
        cr.strokePreserve();

        Clutter.cairo_set_source_color(cr, windowBackgroundColor);
        cr.fill();
    }

    onRepaint(area) {
        if (this.scaleFactor === 0) this.setGraphSize();

        let graphThemeNode = this.graphArea.get_theme_node();
        let cr = area.get_context();
        cr.setLineWidth(1);

        let windows = this.workspace.list_windows();
        windows = windows.filter( Main.isInteresting );
        windows = windows.filter(
            function(w) {
                return !w.is_skip_taskbar() && !w.minimized;
            });

        windows.sort(this.sortWindowsByUserTime);

        if (windows.length) {
            let focusWindow = null;

            for (let i = 0; i < windows.length; ++i) {
                let metaWindow = windows[i];

                if (metaWindow.has_focus()) {
                    focusWindow = metaWindow;
                    continue;
                }

                this.paintWindow(metaWindow, graphThemeNode, cr);
            }

            if (focusWindow) {
                this.paintWindow(focusWindow, graphThemeNode, cr);
            }
        }

        cr.$dispose();
    }


    update() {
        this.graphArea.queue_repaint();
    }

    activate(active) {
        if (active)
            this.actor.add_style_pseudo_class('active');
        else
            this.actor.remove_style_pseudo_class('active');
    }
}

class SimpleButton extends WorkspaceButton {
    constructor(index, applet) {
        super(index, applet);

        this.actor = new St.Button({
            name: 'workspaceButton',
            style_class: 'workspace-button',
            reactive: applet._draggable.inhibit,
            can_focus: true,
            track_hover: true,
        });

        if (applet.orientation === St.Side.TOP || applet.orientation === St.Side.BOTTOM) {
            this.actor.set_height(applet._panelHeight);
        } else {
            this.actor.set_width(applet._panelHeight);
            this.actor.add_style_class_name('vertical');
        }

        this.label = new St.Label({
            text: this.workspace_name,
            x_expand: false,
            y_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER
        });

        this.label.set_style('margin: 0 2px; font-weight: 600;');
        this.label.clutter_text.set_ellipsize(Pango.EllipsizeMode.NONE);

        this.actor.set_child(this.label);

        // Set initial button styles allowing it to expand
        this.actor.set_style(`
            min-width: 35px;
            max-width: none; 
            width: auto;     
        `);

        // Force an initial size calculation based on the label's content
        this._updateButtonSize();

        this.update();
    }

    _updateButtonSize() {
        // Calculate preferred width of the label
        // get_preferred_width returns [min_width, natural_width]
        let [minLabelWidth, naturalLabelWidth] = this.label.get_preferred_width(null);
        
        // Add some padding to the label's natural width for the button
        // A common value for horizontal padding on buttons is around 10-20px
        let desiredButtonWidth = Math.max(25, naturalLabelWidth + 15); // Use 25 as min-width

        // Explicitly set the width. This might override some CSS,
        // but it forces the button to take the size we calculate.
        // It's still good to keep `max-width: none` in the CSS for safety.
        this.actor.width = desiredButtonWidth;
    }

    activate(active) {
        if (active) {
            this.actor.add_style_pseudo_class('outlined');
        } else {
            this.actor.remove_style_pseudo_class('outlined');
            this.update();
        }
    }

    updateName() {
        super.updateName();
        this.label.set_text(this.workspace_name);
        
        this._updateButtonSize();
    }

    shade(used) {
        if (!used) {
            this.actor.add_style_pseudo_class('shaded');
        } else {
            this.actor.remove_style_pseudo_class('shaded');
        }
    }

    update() {
        let windows = this.workspace.list_windows();
        let used = windows.some(Main.isInteresting);
        this.shade(used);
    }
}

class CinnamonWorkspaceSwitcher extends Applet.Applet {
    constructor(metadata, orientation, panel_height, instance_id) {
        super(orientation, panel_height, instance_id);

        this.setAllowedLayout(Applet.AllowedLayout.BOTH);

        this.orientation = orientation;
        this.signals = new SignalManager.SignalManager(null);
        this.buttons = [];
        this._last_switch = 0;
        this._last_switch_direction = 0;
        this.createButtonsQueued = false;

        this._focusWindow = null;
        if (global.display.focus_window)
            this._focusWindow = global.display.focus_window;

        this.settings = new Settings.AppletSettings(this, metadata.uuid, instance_id);
        this.settings.bind("display-type", "display_type", this.queueCreateButtons);
        this.settings.bind("scroll-behavior", "scroll_behavior");

        this.actor.connect('scroll-event', this.hook.bind(this));

        this.signals.connect(Main.layoutManager, 'monitors-changed', this.onWorkspacesUpdated, this);

        // Ensure the applet's main box does not expand indefinitely if its children don't demand space.
        // This allows the combined width of the buttons to define the applet's overall width.
        if (this.orientation == St.Side.TOP || this.orientation == St.Side.BOTTOM) {
            this.actor.set_vertical(false);
            this.actor.x_expand = false;
        } else {
            this.actor.set_vertical(true);
            this.actor.y_expand = false;
        }

        this.queueCreateButtons();
        global.workspace_manager.connect('notify::n-workspaces', () => { this.onWorkspacesUpdated() });
        global.workspace_manager.connect('workspaces-reordered', () => { this.onWorkspacesUpdated() });
        global.window_manager.connect('switch-workspace', this._onWorkspaceChanged.bind(this));
        global.settings.connect('changed::panel-edit-mode', Lang.bind(this, this.on_panel_edit_mode_changed));

        let expoMenuItem = new PopupMenu.PopupIconMenuItem(_("Manage workspaces (Expo)"), "view-grid-symbolic", St.IconType.SYMBOLIC);
        expoMenuItem.connect('activate', Lang.bind(this, function() {
            if (!Main.expo.animationInProgress)
                Main.expo.toggle();
        }));
        this._applet_context_menu.addMenuItem(expoMenuItem);

        let addWorkspaceMenuItem = new PopupMenu.PopupIconMenuItem (_("Add a new workspace"), "list-add", St.IconType.SYMBOLIC);
        
        addWorkspaceMenuItem.connect('activate', Lang.bind(this, function() {
            Main._addWorkspace();
        }));
        
        this._applet_context_menu.addMenuItem(addWorkspaceMenuItem);

        this.removeWorkspaceMenuItem = new PopupMenu.PopupIconMenuItem (_("Remove the current workspace"), "list-remove", St.IconType.SYMBOLIC);    

        this.removeWorkspaceMenuItem.connect('activate', this.removeCurrentWorkspace.bind(this));
        
        this._applet_context_menu.addMenuItem(this.removeWorkspaceMenuItem);
        
        this.removeWorkspaceMenuItem.setSensitive(global.workspace_manager.n_workspaces > 1);

        let renameWorkspaceMenuItem = new PopupMenu.PopupIconMenuItem(
            _("Rename current workspace"), "document-edit-symbolic", St.IconType.SYMBOLIC
        );
        
        renameWorkspaceMenuItem.connect('activate', Lang.bind(this, this.renameCurrentWorkspace));
        
        this._applet_context_menu.addMenuItem(renameWorkspaceMenuItem);
    }

    /**
     * Custom implementation of an input dialog.
     * @param {string} title - The title of the dialog.
     * @param {string} message - The message displayed in the dialog.
     * @param {string} defaultText - The initial text in the input field.
     * @param {function(string|null): void} callback - Callback function (newName or null if cancelled).
     */
    _showTextInputDialog(title, message, defaultText, callback) {
        let dialog = new ModalDialog.ModalDialog();
        let content = new St.BoxLayout({ vertical: true, style_class: 'prompt-dialog-content' });
        
        let messageLabel = new St.Label({ text: message, x_align: Clutter.ActorAlign.CENTER });
        messageLabel.set_style('padding: 10px; font-weight: bold;');
        content.add_child(messageLabel);

        let textEntry = new St.Entry({
            text: defaultText || '',
            style_class: 'text-entry',
            x_expand: true,
            can_focus: true
        });
        textEntry.clutter_text.connect('activate', Lang.bind(this, () => {
            textEntry.clutter_text.set_selection(0, textEntry.clutter_text.text.length);
        }));
        textEntry.clutter_text.connect('key-press-event', Lang.bind(this, (actor, event) => {
            if (event.get_key_symbol() === Clutter.KEY_Return || event.get_key_symbol() === Clutter.KEY_KP_Enter) {
                dialog.close(Clutter.ScrollDirection.DOWN);
                callback(textEntry.text);
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_CONTINUE;
        }));

        content.add_child(textEntry);
        
        dialog.contentLayout.add_child(content);

        dialog.setButtons([
            {
                label: _("Rename"),
                action: Lang.bind(this, () => {
                    dialog.close(Clutter.ScrollDirection.DOWN);
                    callback(textEntry.text);
                }),
                default: true
            },
            {
                label: _("Cancel"),
                action: Lang.bind(this, () => {
                    dialog.close(Clutter.ScrollDirection.DOWN);
                    callback(null);
                })
            }
        ]);
        
        dialog.open();
        Mainloop.idle_add(() => {
            textEntry.grab_key_focus();
            textEntry.clutter_text.set_selection(0, textEntry.clutter_text.text.length);
            return GLib.SOURCE_REMOVE;
        });
    }

    
    // Prompts the user to rename the current active workspace.
    renameCurrentWorkspace() {
        let activeWorkspaceIndex = global.workspace_manager.get_active_workspace_index();
        let currentWorkspaceName = Main.getWorkspaceName(activeWorkspaceIndex);

        const dialogTitle = _("Rename Workspace");
        const dialogMessage = _("Enter new name for workspace %d:").format(activeWorkspaceIndex + 1);
        const dialogDefaultText = currentWorkspaceName;
        
        this._showTextInputDialog(
            dialogTitle,
            dialogMessage,
            dialogDefaultText,
            Lang.bind(this, function(newName) {
                if (newName === null) {
                    return;
                }

                let trimmedNewName = newName.trim();
                let trimmedCurrentName = currentWorkspaceName.trim();
                
                if (trimmedNewName === trimmedCurrentName) {
                    this.queueCreateButtons(); 
                    return;
                }

                try {
                    let settings = new Gio.Settings({ schema_id: 'org.cinnamon.desktop.wm.preferences' });
                    let workspaceNames = settings.get_strv('workspace-names');
                    
                    const numWorkspaces = global.workspace_manager.n_workspaces;
                    while (workspaceNames.length < numWorkspaces) {
                        workspaceNames.push('');
                    }

                    if (activeWorkspaceIndex < numWorkspaces) {
                        workspaceNames[activeWorkspaceIndex] = trimmedNewName;
                        settings.set_strv('workspace-names', workspaceNames);
                    } else {
                        global.logError(`Workspace index ${activeWorkspaceIndex} still out of bounds for current names array (length: ${workspaceNames.length}, n_workspaces: ${numWorkspaces}).`);
                    }
                } catch (e) {
                    global.logError(`Failed to rename workspace via Gio.Settings: ${e.message}`);
                }

                this.queueCreateButtons(); 
            })
        );
    }

    onWorkspacesUpdated() {
        this.removeWorkspaceMenuItem.setSensitive(global.workspace_manager.n_workspaces > 1);
        this._createButtons();
    }

    removeCurrentWorkspace() {
        if (global.workspace_manager.n_workspaces <= 1) {
            return;
        }
        this.workspace_index = global.workspace_manager.get_active_workspace_index();
        removeWorkspaceAtIndex(this.workspace_index);
    }

    _onWorkspaceChanged(wm, from, to) {
        if (this.buttons[from]) {
            this.buttons[from].activate(false);
        }
        if (this.buttons[to]) {
            this.buttons[to].activate(true);
        }
    }

    on_panel_edit_mode_changed() {
        let reactive = !global.settings.get_boolean('panel-edit-mode');
        for (let i = 0; i < this.buttons.length; ++i) {
            this.buttons[i].actor.reactive = reactive;
        }
    }

    on_orientation_changed(neworientation) {
        this.orientation = neworientation;

        // This block is now handled in the constructor, but retained here for consistency
        // if this method were called outside initial setup. The constructor's setting
        // will take precedence initially.
        if (this.orientation == St.Side.TOP || this.orientation == St.Side.BOTTOM)
            this.actor.set_vertical(false);
        else
            this.actor.set_vertical(true);

        this.queueCreateButtons();
    }

    on_panel_height_changed() {
        this.queueCreateButtons();
    }

    hook(actor, event) {
        if (this.scroll_behavior == "disabled")
            return;

        let now = (new Date()).getTime();
        let direction = event.get_scroll_direction();

        if(direction !== 0 && direction !== 1) return;

        if ((now - this._last_switch) > MIN_SWITCH_INTERVAL_MS ||
            direction !== this._last_switch_direction) {

            if ((direction == 0) == (this.scroll_behavior == "normal"))
                Main.wm.actionMoveWorkspaceLeft();
            else
                Main.wm.actionMoveWorkspaceRight();

            this._last_switch = now;
            this._last_switch_direction = direction;
        }
    }

    queueCreateButtons() {
        if (!this.createButtonsQueued) {
            Mainloop.idle_add(Lang.bind(this, this._createButtons));
            this.createButtonsQueued = true;
        }
    }

    _createButtons() {
        this.createButtonsQueued = false;
        for (let i = 0; i < this.buttons.length; ++i) {
            this.buttons[i].destroy();
        }

        if (this.display_type == "visual")
            this.actor.set_style_class_name('workspace-graph');
        else
            this.actor.set_style_class_name('workspace-switcher');

        this.actor.set_important(true);

        this.buttons = [];
        for (let i = 0; i < global.workspace_manager.n_workspaces; ++i) {
            if (this.display_type == "visual")
                this.buttons[i] = new WorkspaceGraph(i, this);
            else
                this.buttons[i] = new SimpleButton(i, this);

            this.actor.add_actor(this.buttons[i].actor);
            this.buttons[i].show();
        }

        this.signals.disconnect("notify::focus-window");
        if (this.display_type == "visual") {
            this.signals.connect(global.display, "notify::focus-window", this._onFocusChanged, this);
            this._onFocusChanged();
        }
    }

    _onFocusChanged() {
        if (global.display.focus_window &&
            this._focusWindow == global.display.focus_window)
            return;

        this.signals.disconnect("position-changed");
        this.signals.disconnect("size-changed");

        if (!global.display.focus_window)
            return;

        this._focusWindow = global.display.focus_window;
        this.signals.connect(this._focusWindow, "position-changed", Lang.bind(this, this._onPositionChanged), this);
        this.signals.connect(this._focusWindow, "size-changed", Lang.bind(this, this._onPositionChanged), this);
        this._onPositionChanged();
    }

    on_applet_removed_from_panel() {
        this.signals.disconnectAllSignals();
    }
}

function removeWorkspaceAtIndex(index) {
    if (global.workspace_manager.n_workspaces <= 1 ||
        index >= global.workspace_manager.n_workspaces) {
        return;
    }

    const removeAction = () => {
        Main._removeWorkspace(global.workspace_manager.get_workspace_by_index(index));
    };

    if (!Main.hasDefaultWorkspaceName(index)) {
        let prompt = _("Are you sure you want to remove workspace \"%s\"?\n\n").format(
            Main.getWorkspaceName(index)
        );

        let confirm = new ModalDialog.ConfirmDialog(prompt, removeAction);
        confirm.open();
    }
    else {
        removeAction();
    }
}

function main(metadata, orientation, panel_height, instance_id) {
    return new CinnamonWorkspaceSwitcher(metadata, orientation, panel_height, instance_id);
}