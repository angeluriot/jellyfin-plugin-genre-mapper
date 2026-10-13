/**
 * Genre Mapper - configuration page.
 * Edits the mapping with the built-in plugin configuration API, previews the changes and resets the genres.
 *
 * The mapping is stored as target genres (kept as they are) and links from the other genres to a target genre (or to nothing to remove them).
 * The page shows it as a single list: each kept genre with the genres merged into it under it, then the removed genres.
 */

const PLUGIN_ID = 'd92c00c2-a490-44ec-9822-d2db5bdbfd0e';

const LOG_PREFIX = '[GenreMapper]';

const TABS = ['Genres', 'Preview', 'Settings'];

// The scheduled tasks of the plugin, with the translation of their status
const TASKS = { GenreMapperApply: 'StatusApply', GenreMapperRestore: 'StatusRestore' };

// Values of the action select of a genre: keep it, rename it, remove it, or merge it into a kept genre (prefix + name)
const KEEP = 'k';
const RENAME = 'n';
const REMOVE = 'r';
const MERGE_PREFIX = 'm';

const STYLE = '<style>'
    + '.gmTabs{display:flex;flex-wrap:wrap;margin:0.5em 0 1.5em;border-bottom:1px solid var(--jf-palette-divider,rgba(255,255,255,.12))}'
    + '.gmTab{background:none;border:0;border-bottom:2px solid transparent;color:inherit;cursor:pointer;font:inherit;opacity:.7;padding:.8em 1.2em}'
    + '.gmTab-active{border-bottom-color:var(--jf-palette-primary-main,#00a4dc);opacity:1}'
    + '.gmGroup{border-bottom:1px solid var(--jf-palette-divider,rgba(128,128,128,.25));padding:.3em 0}'
    + '.gmRow{display:flex;align-items:center;gap:1em;padding:.35em 0}'
    + '.gmChild{padding-left:2.2em}'
    + '.gmChild .gmName:before{content:"\\21B3";opacity:.5;margin-right:.5em}'
    + '.gmName{flex:1;min-width:0;overflow-wrap:anywhere}'
    + '.gmGroupName{font-weight:600}'
    + '.gmRemovedName{text-decoration:line-through;opacity:.7}'
    + '.gmCount{opacity:.6;font-size:.9em;margin-left:.5em;white-space:nowrap}'
    + '.gmBadge{display:inline-block;font-size:.7em;padding:.1em .6em;border-radius:1em;background:rgba(128,128,128,.25);margin-left:.5em;vertical-align:middle}'
    + '.gmRow .selectContainer{margin:0;flex:0 0 40%;max-width:18em}'
    + '.gmRow .selectLabel{display:none}'
    + '.gmRow .selectArrowContainer{top:0;bottom:0;display:flex;align-items:center}.gmRow .selectArrow{margin:0}'
    + '.gmRename{display:flex;align-items:flex-end;gap:1em;padding:.3em 0 .8em 2.2em}.gmRename .inputContainer{flex:1;margin:0}.gmRename .emby-button{margin:0;flex:none}'
    + '.gmToolbar{display:flex;flex-wrap:wrap;align-items:center;gap:0 2em}.gmToolbar .inputContainer{flex:1;min-width:12em}'
    + '.gmSectionTitle{margin:2em 0 .5em}'
    + '.gmBox{padding:1em 1.2em;border:1px solid var(--jf-palette-divider,rgba(128,128,128,.3));border-radius:.5em;margin-bottom:2em}'
    + '.gmBox h3{margin:0 0 .5em}'
    + '.gmStatus{padding:.8em 1em;border-radius:.5em;background:rgba(0,164,220,.15);margin-bottom:1em}'
    + '.gmPreview table{width:100%;border-collapse:collapse}.gmPreview th,.gmPreview td{text-align:left;padding:.4em .5em;border-bottom:1px solid var(--jf-palette-divider,rgba(128,128,128,.2))}'
    + '.gmPreview td:not(:first-child),.gmPreview th:not(:first-child){text-align:right;width:7em}'
    + '.gmAdded{color:#81c784}.gmRemoved{color:#e57373}'
    + '</style>';

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function optionsHtml(options, selectedValue) {
    return options.map(function (option) {
        const selected = option.value === selectedValue ? ' selected' : '';
        return '<option value="' + escapeHtml(option.value) + '"' + selected + '>' + escapeHtml(option.label) + '</option>';
    }).join('');
}

/** A comparable form of a genre name for the search: without case or accents. */
function normalize(name) {
    return String(name).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function compareNames(a, b) {
    return a.localeCompare(b, undefined, { sensitivity: 'base' }) || (a < b ? -1 : a > b ? 1 : 0);
}

function confirmDialog(message, title) {
    return new Promise(function (resolve) {
        if (window.Dashboard && Dashboard.confirm) {
            Dashboard.confirm(message, title, resolve);
        } else {
            resolve(window.confirm(message));
        }
    });
}

/** The language chosen by the administrator, or the one of the Jellyfin interface. */
function resolveLanguage(language, languages) {
    const wanted = (language || document.documentElement.lang || navigator.language || 'en').toLowerCase();
    const codes = languages.map(function (item) {
        return item.Code;
    });
    return codes.find(function (code) {
        return code.toLowerCase() === wanted;
    }) || codes.find(function (code) {
        return code.toLowerCase() === wanted.split('-')[0];
    }) || 'en';
}

/** Loads the translations of a language (English for the missing strings) and returns the translation function. */
function loadTranslator(apiClient, data, code) {
    const codes = code === 'en' ? ['en'] : ['en', code];

    return Promise.all(codes.map(function (c) {
        return fetch(apiClient.getUrl('GenreMapper/Web/Localization/' + c + '.json', { v: data.Version }))
            .then(function (response) {
                return response.ok ? response.json() : {};
            })
            .catch(function (error) {
                console.error(LOG_PREFIX, 'Failed to load the translations', c, error);
                return {};
            });
    })).then(function (dictionaries) {
        const strings = Object.assign.apply(null, [{}].concat(dictionaries));
        const pluralRules = new Intl.PluralRules(code);
        const translate = function (key, params) {
            const text = Object.prototype.hasOwnProperty.call(strings, key) ? strings[key] : key;
            return text.replace(/\{(\w+)\}/g, function (match, name) {
                return params && params[name] != null ? params[name] : match;
            });
        };
        translate.count = function (count) {
            return translate(pluralRules.select(count) === 'one' ? 'ItemCountOne' : 'ItemCountOther', { count: count });
        };
        return translate;
    });
}

class ConfigPage {
    constructor(view, data, config) {
        this.apiClient = window.ApiClient;
        this.root = view.querySelector('.gmConfig');
        this.config = config;
        this.activeTab = 'Genres';
        this.renaming = null;
        this.hideUnused = true;
        this.statusTimer = null;
        this.pollUntil = 0;
        this.runningTasks = [];
        this.t = null;
        this.setData(data);
        this.initMapping();

        this.root.addEventListener('click', this.onClick.bind(this));
        this.root.addEventListener('change', this.onChange.bind(this));
        this.root.addEventListener('input', this.onInput.bind(this));
        this.root.addEventListener('submit', this.onSubmit.bind(this));
        this.root.addEventListener('keydown', this.onKeyDown.bind(this));
    }

    // ------------------------------------------------------------------ data

    /** The known genres by name, including the ones of the saved mapping that are not known anymore. */
    setData(data) {
        this.data = data;
        this.sources = new Map();
        data.Genres.forEach((genre) => {
            this.sources.set(genre.Name, genre);
        });
        (this.config.Mappings || []).forEach((mapping) => {
            if (mapping.Source && !this.sources.has(mapping.Source)) {
                this.sources.set(mapping.Source, { Name: mapping.Source, Count: 0, Origins: [] });
            }
        });
    }

    /** Builds the kept genres and the links of the other genres from the configuration, like the server does. */
    initMapping() {
        const config = this.config;
        const isDefault = !(config.TargetGenres || []).length && !(config.Mappings || []).length;

        this.targets = isDefault ? Array.from(this.sources.keys()) : (config.TargetGenres || []).slice();
        this.links = new Map();
        (config.Mappings || []).forEach((mapping) => {
            if (this.targets.indexOf(mapping.Source) === -1 && (!mapping.Target || this.targets.indexOf(mapping.Target) !== -1)) {
                this.links.set(mapping.Source, mapping.Target || '');
            }
        });
        this.keepUnmapped();
    }

    /** The genres without mapping (like the new ones) are kept as they are. */
    keepUnmapped() {
        this.sources.forEach((genre, name) => {
            if (!this.isTarget(name) && !this.links.has(name)) {
                this.targets.push(name);
            }
        });
        this.targets.sort(compareNames);
    }

    reloadData() {
        return this.apiClient.getJSON(this.apiClient.getUrl('GenreMapper/Data')).then((data) => {
            this.setData(data);
            this.keepUnmapped();
            this.render();
        }).catch(function (error) {
            console.error(LOG_PREFIX, error);
        });
    }

    loadTranslations() {
        const code = resolveLanguage(this.config.Language, this.data.Languages);
        return loadTranslator(this.apiClient, this.data, code).then((t) => {
            this.t = t;
            this.uiLanguage = code;
        });
    }

    isTarget(name) {
        return this.targets.indexOf(name) !== -1;
    }

    getCount(name) {
        const genre = this.sources.get(name);
        return genre ? genre.Count : 0;
    }

    /** The genres merged into a kept genre (without itself) or removed (empty target). */
    getLinkedSources(target) {
        const result = [];
        this.links.forEach(function (linked, source) {
            if (linked === target) {
                result.push(source);
            }
        });
        return result.sort(compareNames);
    }

    /** Approximate number of items of a kept genre after the mapping (an item can have several of its genres). */
    getGroupCount(target) {
        return this.getLinkedSources(target).reduce((total, source) => total + this.getCount(source), this.getCount(target));
    }

    getMapping() {
        const mappings = [];
        this.links.forEach(function (target, source) {
            mappings.push({ Source: source, Target: target });
        });
        return { TargetGenres: this.targets.slice(), Mappings: mappings };
    }

    // -------------------------------------------------------------- mapping

    keep(name) {
        if (!this.isTarget(name)) {
            this.targets.push(name);
            this.targets.sort(compareNames);
        }
        // A kept genre is never changed
        this.links.delete(name);
    }

    /**
     * Changes what becomes of a genre: kept (target), merged into a kept genre, or removed (empty target).
     * A kept genre takes the genres merged into it along.
     */
    setTarget(name, target) {
        if (target === name) {
            this.keep(name);
            return;
        }
        if (target) {
            this.keep(target);
        }

        if (this.isTarget(name)) {
            this.getLinkedSources(name).forEach((source) => {
                this.links.set(source, target);
            });
            this.targets = this.targets.filter(function (other) {
                return other !== name;
            });
            // A kept genre that is not a known genre (a new name) disappears when it is renamed, merged or removed
            if (!this.sources.has(name)) {
                return;
            }
        }
        this.links.set(name, target);
    }

    // ------------------------------------------------------------- rendering

    render() {
        const t = this.t;
        const tabs = TABS.map((tab) => {
            return '<button type="button" class="gmTab' + (tab === this.activeTab ? ' gmTab-active' : '') + '" data-action="tab" data-tab="' + tab + '">'
                + escapeHtml(t('Tab' + tab)) + '</button>';
        }).join('');

        const languageOptions = this.data.Languages.map(function (language) {
            return { value: language.Code, label: language.Name };
        });

        this.root.innerHTML = STYLE
            + '<form class="gmForm">'
            + '<div class="sectionTitleContainer flex align-items-center"><h2 class="sectionTitle">Genre Mapper</h2></div>'
            + '<div class="gmStatus hide"></div>'
            + '<div class="gmTabs">' + tabs + '</div>'
            + this.panelHtml('Genres', ''
            + '<p class="fieldDescription">' + escapeHtml(t('GenresHelp')) + '</p>'
            + '<div class="gmToolbar">'
            + '<div class="inputContainer"><input is="emby-input" type="search" class="gmSearch" autocomplete="off" label="' + escapeHtml(t('Search')) + '" /></div>'
            + '<label class="checkboxContainer"><input is="emby-checkbox" type="checkbox" class="gmHideUnused"' + (this.hideUnused ? ' checked' : '') + ' />'
            + '<span>' + escapeHtml(t('HideUnused')) + '</span></label>'
            + '</div>'
            + '<div class="gmGenres"></div>')
            + this.panelHtml('Preview', ''
            + '<p class="fieldDescription">' + escapeHtml(t('PreviewHelp')) + '</p>'
            + '<button is="emby-button" type="button" class="raised" data-action="preview" style="margin:0 0 1.5em"><span>' + escapeHtml(t('Refresh')) + '</span></button>'
            + '<div class="gmPreview"></div>')
            + this.panelHtml('Settings', ''
            + '<div class="selectContainer"><select is="emby-select" data-field="Language" label="' + escapeHtml(t('Language')) + '">'
            + optionsHtml(languageOptions, this.uiLanguage) + '</select></div>'
            + '<div class="inputContainer"><input is="emby-input" type="text" data-field="CommitHash" maxlength="40" autocomplete="off" label="'
            + escapeHtml(t('CommitHash')) + '" value="' + escapeHtml(this.config.CommitHash) + '" />'
            + '<div class="fieldDescription">' + escapeHtml(t('CommitHashHelp')) + '</div></div>'
            + '<div class="gmBox" style="margin-top:2em"><h3>' + escapeHtml(t('Reset')) + '</h3>'
            + '<p class="fieldDescription">' + escapeHtml(t('ResetHelp')) + '</p>'
            + '<p>' + escapeHtml(t('ResetCount', { count: this.data.RestorableItems })) + '</p>'
            + '<button is="emby-button" type="button" class="raised" data-action="reset" style="margin:0"><span>' + escapeHtml(t('Reset')) + '</span></button>'
            + '</div>')
            + '<button is="emby-button" type="submit" class="raised button-submit block" style="margin-top:2em"><span>' + escapeHtml(t('Save')) + '</span></button>'
            + '</form>';

        this.renderGenres();
        this.renderStatus();
        if (this.activeTab === 'Preview') {
            this.renderPreview();
        }
    }

    panelHtml(tab, content) {
        return '<div class="gmPanel' + (tab === this.activeTab ? '' : ' hide') + '" data-tab="' + tab + '">' + content + '</div>';
    }

    /** The kept genres with the genres merged into them, then the removed genres. */
    renderGenres() {
        const t = this.t;
        const container = this.root.querySelector('.gmGenres');
        const searchInput = this.root.querySelector('.gmSearch');
        const search = normalize(searchInput ? searchInput.value.trim() : '');
        const matches = function (names) {
            return !search || names.some(function (name) {
                return normalize(name).indexOf(search) !== -1;
            });
        };
        const isVisible = (name) => !this.hideUnused || this.getCount(name) > 0 || this.renaming === name;

        // A new name without genres merged into it anymore is not a genre anymore
        this.targets = this.targets.filter((target) => this.sources.has(target) || this.getLinkedSources(target).length > 0);

        // The same options for every select, the current value is set after rendering
        const mergeOptions = this.targets.map(function (target) {
            return '<option value="' + escapeHtml(MERGE_PREFIX + target) + '">' + escapeHtml(target) + '</option>';
        }).join('');
        const selectOptions = '<option value="' + KEEP + '">' + escapeHtml(t('Keep')) + '</option>'
            + '<option value="' + RENAME + '">' + escapeHtml(t('Rename')) + '</option>'
            + '<optgroup label="' + escapeHtml(t('MergeInto')) + '">' + mergeOptions + '</optgroup>'
            + '<option value="' + REMOVE + '">' + escapeHtml(t('Remove')) + '</option>';

        const groups = this.targets.map((target) => {
            const children = this.getLinkedSources(target).filter(isVisible);
            if ((!isVisible(target) && !children.length) || !matches([target].concat(children))) {
                return '';
            }
            return '<div class="gmGroup">'
                + this.rowHtml(target, KEEP, 'gmGroupName', this.getGroupCount(target), selectOptions)
                + children.map((child) => this.rowHtml(child, MERGE_PREFIX + target, 'gmChild', this.getCount(child), selectOptions)).join('')
                + '</div>';
        }).join('');

        const removed = this.getLinkedSources('').filter((name) => isVisible(name) && matches([name]));

        container.innerHTML = (groups || '<p class="fieldDescription">' + escapeHtml(t('NoGenres')) + '</p>')
            + (removed.length ? '<h3 class="gmSectionTitle">' + escapeHtml(t('RemovedGenres')) + '</h3>'
                + '<div class="gmGroup">' + removed.map((name) => this.rowHtml(name, REMOVE, 'gmRemovedName', this.getCount(name), selectOptions)).join('') + '</div>' : '');

        container.querySelectorAll('select[data-genre]').forEach(function (select) {
            select.value = select.getAttribute('data-value');
            // A genre cannot be merged into itself
            const own = select.querySelector('option[value="' + CSS.escape(MERGE_PREFIX + select.getAttribute('data-genre')) + '"]');
            if (own) {
                own.remove();
            }
        });

        const renameInput = container.querySelector('.gmRenameInput');
        if (renameInput) {
            renameInput.focus();
            renameInput.select();
        }
    }

    rowHtml(name, value, className, count, selectOptions) {
        const t = this.t;
        const genre = this.sources.get(name);
        const badges = (genre ? genre.Origins : []).map(function (origin) {
            return '<span class="gmBadge">' + escapeHtml(origin) + '</span>';
        }).join('');
        const isChild = className === 'gmChild';

        return '<div class="gmRow' + (isChild ? ' gmChild' : '') + '">'
            + '<div class="gmName"><span class="' + (isChild ? '' : className) + '">' + escapeHtml(name) + '</span>'
            + '<span class="gmCount">' + escapeHtml(t.count(count)) + '</span>' + badges + '</div>'
            + '<div class="selectContainer"><select is="emby-select" data-genre="' + escapeHtml(name) + '" data-value="' + escapeHtml(value) + '" aria-label="'
            + escapeHtml(name) + '">' + selectOptions + '</select></div>'
            + '</div>'
            + (this.renaming === name ? '<div class="gmRename">'
                + '<div class="inputContainer"><input is="emby-input" type="text" class="gmRenameInput" autocomplete="off" label="' + escapeHtml(t('NewName'))
                + '" value="' + escapeHtml(name) + '" /></div>'
                + '<button is="emby-button" type="button" class="raised" data-action="rename"><span>' + escapeHtml(t('Ok')) + '</span></button>'
                + '<button is="emby-button" type="button" class="raised" data-action="cancelRename"><span>' + escapeHtml(t('Cancel')) + '</span></button>'
                + '</div>' : '');
    }

    renderPreview() {
        const t = this.t;
        const container = this.root.querySelector('.gmPreview');
        container.innerHTML = '';
        Dashboard.showLoadingMsg();

        return this.apiClient.ajax({
            type: 'POST',
            url: this.apiClient.getUrl('GenreMapper/Preview'),
            data: JSON.stringify(this.getMapping()),
            contentType: 'application/json',
            dataType: 'json'
        }).then(function (result) {
            if (!result.ChangedItems) {
                container.innerHTML = '<p>' + escapeHtml(t('PreviewNoChanges')) + '</p>';
                return;
            }

            container.innerHTML = '<p>' + escapeHtml(t('PreviewChangedItems', { count: result.ChangedItems })) + '</p>'
                + '<table><thead><tr><th>' + escapeHtml(t('PreviewGenre')) + '</th><th>' + escapeHtml(t('PreviewBefore')) + '</th><th>'
                + escapeHtml(t('PreviewAfter')) + '</th></tr></thead><tbody>'
                + result.Genres.map(function (genre) {
                    const className = genre.After === 0 ? 'gmRemoved' : genre.Before === 0 ? 'gmAdded' : '';
                    return '<tr class="' + className + '"><td>' + escapeHtml(genre.Name) + '</td><td>' + genre.Before + '</td><td>' + genre.After + '</td></tr>';
                }).join('')
                + '</tbody></table>';
        }).catch(function (error) {
            console.error(LOG_PREFIX, error);
        }).then(function () {
            Dashboard.hideLoadingMsg();
        });
    }

    /** Shows the progress of the tasks of the plugin, refreshed while they run. */
    renderStatus() {
        const container = this.root.querySelector('.gmStatus');
        if (!container) {
            return;
        }
        container.innerHTML = this.runningTasks.map((task) => {
            return '<div>' + escapeHtml(this.t(TASKS[task.Key], { progress: Math.round(task.CurrentProgressPercentage || 0) })) + '</div>';
        }).join('');
        container.classList.toggle('hide', !this.runningTasks.length);
    }

    pollStatus() {
        clearTimeout(this.statusTimer);
        if (!this.root.isConnected) {
            return;
        }

        this.apiClient.getJSON(this.apiClient.getUrl('ScheduledTasks')).then((tasks) => {
            const wasRunning = this.runningTasks.length > 0;
            this.runningTasks = tasks.filter(function (task) {
                return TASKS[task.Key] && task.State !== 'Idle';
            });
            this.renderStatus();

            if (this.runningTasks.length || Date.now() < this.pollUntil) {
                this.statusTimer = setTimeout(() => this.pollStatus(), 2000);
            }
            if (wasRunning && !this.runningTasks.length) {
                // The genres of the items changed
                this.reloadData();
            }
        }).catch(function (error) {
            console.error(LOG_PREFIX, error);
        });
    }

    /** Polls the status of the tasks for a few seconds at least, the time for a queued task to start. */
    watchTasks() {
        this.pollUntil = Date.now() + 8000;
        this.pollStatus();
    }

    // ---------------------------------------------------------------- events

    onClick(event) {
        const button = event.target.closest('[data-action]');
        if (!button) {
            return;
        }

        switch (button.getAttribute('data-action')) {
            case 'tab':
                this.activeTab = button.getAttribute('data-tab');
                this.root.querySelectorAll('.gmTab').forEach((tab) => {
                    tab.classList.toggle('gmTab-active', tab === button);
                });
                this.root.querySelectorAll('.gmPanel').forEach((panel) => {
                    panel.classList.toggle('hide', panel.getAttribute('data-tab') !== this.activeTab);
                });
                if (this.activeTab === 'Preview') {
                    this.renderPreview();
                }
                break;
            case 'preview':
                this.renderPreview();
                break;
            case 'reset':
                this.reset();
                break;
            case 'rename': {
                const name = this.root.querySelector('.gmRenameInput').value.trim();
                if (name) {
                    this.setTarget(this.renaming, name);
                }
                this.renaming = null;
                this.renderGenres();
                break;
            }
            case 'cancelRename':
                this.renaming = null;
                this.renderGenres();
                break;
            default:
                break;
        }
    }

    /** Enter in the rename field renames the genre instead of saving the form, Escape cancels. */
    onKeyDown(event) {
        if (!event.target.classList.contains('gmRenameInput') || (event.key !== 'Enter' && event.key !== 'Escape')) {
            if (event.key === 'Enter' && event.target.tagName === 'INPUT' && event.target.type === 'search') {
                event.preventDefault();
            }
            return;
        }

        event.preventDefault();
        const action = event.key === 'Enter' ? 'rename' : 'cancelRename';
        this.root.querySelector('.gmRename [data-action="' + action + '"]').click();
    }

    onInput(event) {
        if (event.target.classList.contains('gmSearch')) {
            this.renderGenres();
        }
    }

    onChange(event) {
        const element = event.target;
        const genre = element.getAttribute('data-genre');

        if (genre !== null) {
            this.onGenreAction(genre, element.value);
        } else if (element.classList.contains('gmHideUnused')) {
            this.hideUnused = element.checked;
            this.renderGenres();
        } else if (element.getAttribute('data-field')) {
            const field = element.getAttribute('data-field');
            this.config[field] = element.value.trim();
            if (field === 'Language') {
                this.loadTranslations().then(() => this.render());
            }
        }
    }

    onGenreAction(genre, value) {
        this.renaming = null;

        if (value === RENAME) {
            this.renaming = genre;
        } else if (value === KEEP) {
            this.keep(genre);
        } else if (value === REMOVE) {
            // Removing a kept genre also removes the genres merged into it
            const count = this.isTarget(genre) ? this.getGroupCount(genre) : 0;
            if (count > 0) {
                confirmDialog(this.t('RemoveConfirm', { genre: genre, count: count }), this.t('Remove')).then((confirmed) => {
                    if (confirmed) {
                        this.setTarget(genre, '');
                    }
                    this.renderGenres();
                });
                return;
            }
            this.setTarget(genre, '');
        } else {
            this.setTarget(genre, value.substring(MERGE_PREFIX.length));
        }

        this.renderGenres();
    }

    onSubmit(event) {
        event.preventDefault();

        const mapping = this.getMapping();
        this.config.TargetGenres = mapping.TargetGenres;
        this.config.Mappings = mapping.Mappings;

        Dashboard.showLoadingMsg();
        this.apiClient.updatePluginConfiguration(PLUGIN_ID, this.config).then(() => {
            Dashboard.processPluginConfigurationUpdateResult();
            Dashboard.alert(this.t('SaveApplying'));
            this.watchTasks();
        }).catch(function (error) {
            console.error(LOG_PREFIX, error);
            Dashboard.hideLoadingMsg();
        });
    }

    reset() {
        const t = this.t;
        confirmDialog(t('ResetConfirm'), t('Reset')).then((confirmed) => {
            if (!confirmed) {
                return;
            }

            Dashboard.showLoadingMsg();
            this.apiClient.ajax({ type: 'POST', url: this.apiClient.getUrl('GenreMapper/Reset') }).then(() => {
                // Same reset as the server: every genre is kept
                this.config.TargetGenres = [];
                this.config.Mappings = [];
                this.initMapping();
                this.render();
                Dashboard.alert(t('ResetStarted'));
                this.watchTasks();
            }).catch(function (error) {
                console.error(LOG_PREFIX, error);
            }).then(function () {
                Dashboard.hideLoadingMsg();
            });
        });
    }
}

/**
 * Loads the configuration and renders the page.
 * @param {HTMLElement} view The page element.
 * @param {Object} data The data of the page (version, languages and known genres).
 */
export function init(view, data) {
    return window.ApiClient.getPluginConfiguration(PLUGIN_ID).then(function (config) {
        config.TargetGenres = config.TargetGenres || [];
        config.Mappings = config.Mappings || [];

        const page = new ConfigPage(view, data, config);
        return page.loadTranslations().then(function () {
            page.render();
            page.pollStatus();
        });
    });
}
