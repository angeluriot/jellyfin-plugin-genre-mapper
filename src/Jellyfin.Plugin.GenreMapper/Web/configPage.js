/**
 * Genre Mapper - configuration page.
 * Edits the mapping with the built-in plugin configuration API, previews the changes and resets the genres.
 *
 * The page shows the final genres on the left, and on the right the original genres (of the items and of the metadata providers) moved into each of them.
 * By default, every original genre is in the final genre of the same name, so nothing changes. An original genre can be duplicated to be in several final genres.
 */

const PLUGIN_ID = 'd92c00c2-a490-44ec-9822-d2db5bdbfd0e';

const LOG_PREFIX = '[GenreMapper]';

const TABS = ['Genres', 'Preview', 'Settings'];

// The scheduled task applying the mapping
const APPLY_TASK = 'GenreMapperApply';

// Values of the "Move to" select of an original genre: a final genre (prefix + name) or the removed genres
const FINAL_PREFIX = 'f';
const REMOVE = 'r';

const STYLE = '<style>'
    + '.gmTabs{display:flex;flex-wrap:wrap;margin:0.5em 0 1.5em;border-bottom:1px solid var(--jf-palette-divider,rgba(255,255,255,.12))}'
    + '.gmTab{background:none;border:0;border-bottom:2px solid transparent;color:inherit;cursor:pointer;font:inherit;opacity:.7;padding:.8em 1.2em}'
    + '.gmTab-active{border-bottom-color:var(--jf-palette-primary-main,#00a4dc);opacity:1}'
    + '.gmToolbar{display:flex;flex-wrap:wrap;align-items:center;gap:0 2em}.gmToolbar .inputContainer{flex:1;min-width:12em}'
    + '.gmGrid{display:grid;grid-template-columns:max-content minmax(3em,1fr) max-content 15em max-content;gap:.3em 1.5em;align-items:center}'
    + '.gmGrid > *{min-height:2.6em}'
    + '.gmHeaderOriginal{grid-column:3}'
    + '.gmHeader{opacity:.6;font-size:.9em;display:flex;align-items:flex-end;min-height:0;padding-bottom:.4em}'
    + '.gmSeparator{grid-column:1/-1;min-height:0;height:1px;margin:.4em 0;background:var(--jf-palette-divider,rgba(128,128,128,.25))}'
    + '.gmFinalCell{grid-column:1;align-self:start;display:flex;align-items:center;gap:.3em}'
    + '.gmFinalInput{width:var(--gmFinalWidth,12em);box-sizing:content-box;font-weight:600}'
    + '.gmFinalCell button{flex:none;opacity:.7}'
    + '.gmRemovedTitle{grid-column:1;align-self:start;display:flex;align-items:center;font-weight:600;color:#e57373}'
    + '.gmSourceName{grid-column:3;display:flex;align-items:center;flex-wrap:wrap}'
    + '.gmSourceSelect{grid-column:4;display:flex;align-items:center}'
    + '.gmArrow{grid-column:2;justify-self:center;display:flex;align-items:center;opacity:.5}'
    + '.gmActions{grid-column:5;display:flex;align-items:center;margin-left:-.9em}'
    + '.gmActions button{opacity:.7}'
    // Only the copy icon is a little smaller, its button keeps the size of the others
    + '.gmActions .content_copy{transform:scale(.87)}'
    + '.gmActions button[disabled]{opacity:.25;cursor:default}'
    + '.gmEmpty{grid-column:3/-1;display:flex;align-items:center;opacity:.6;font-style:italic}'
    + '.gmCount{opacity:.6;font-size:.9em;margin-left:.4em;white-space:nowrap}'
    + '.gmBadge{display:inline-block;font-size:.7em;padding:.1em .6em;border-radius:1em;background:rgba(128,128,128,.25);margin-left:.5em}'
    + '.gmSourceSelect .selectContainer{margin:0;width:100%}'
    + '.gmSourceSelect .selectLabel{display:none}'
    + '.gmSourceSelect .selectArrowContainer{top:0;bottom:0;display:flex;align-items:center}.gmSourceSelect .selectArrow{margin:0}'
    + '.gmAdd{margin-top:1.5em}.gmAddRow{display:flex;align-items:stretch;gap:1em}.gmAddRow .emby-input{flex:1}'
    + '.gmAddRow .emby-button{margin:0;flex:none;padding-top:0;padding-bottom:0}'
    + '.gmBox{padding:1em 1.2em;border:1px solid var(--jf-palette-divider,rgba(128,128,128,.3));border-radius:.5em;margin-bottom:2em}'
    + '.gmBox h3{margin:0 0 .5em}'
    + '.gmStatus{padding:.8em 1em;border-radius:.5em;background:rgba(0,164,220,.15);margin-bottom:1em}'
    + '.gmPreview table{width:100%;border-collapse:collapse}.gmPreview th,.gmPreview td{text-align:left;padding:.4em .5em;border-bottom:1px solid var(--jf-palette-divider,rgba(128,128,128,.2))}'
    + '.gmPreview td:not(:first-child),.gmPreview th:not(:first-child){text-align:right;width:7em}'
    + '.gmAdded{color:#81c784}.gmRemoved{color:#e57373}'
    // The forms are limited to 54em wide by the web client, too narrow for the genres
    + 'form.gmForm{max-width:82em}'
    + '@media (max-width:50em){.gmGrid{grid-template-columns:minmax(0,1fr) 12em max-content;column-gap:1em}.gmHeader{display:none}'
    + '.gmFinalCell,.gmRemovedTitle,.gmEmpty{grid-column:1/-1;grid-row:auto !important}.gmFinalInput{width:100%}'
    + '.gmSourceName{grid-column:1;padding-left:1em}.gmSourceSelect{grid-column:2}.gmActions{grid-column:3;margin-left:0}.gmArrow{display:none}}'
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
        this.hideUnused = false;
        this.statusTimer = null;
        this.pollUntil = 0;
        this.applyTask = null;
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

    /** The original genres by name, including the ones of the saved mapping that are not known anymore. */
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

    /** Builds the final genres and the final genres of each original genre (none if it is removed) from the configuration. */
    initMapping() {
        this.finals = (this.config.TargetGenres || []).slice();
        this.assignments = new Map();
        (this.config.Mappings || []).forEach((mapping) => {
            const finals = this.assignments.get(mapping.Source) || [];
            if (mapping.Target && finals.indexOf(mapping.Target) === -1) {
                finals.push(mapping.Target);
            }
            this.assignments.set(mapping.Source, finals);
        });
        this.assignNew();
    }

    /** The original genres without mapping (like the new ones) are in the final genre of the same name, so they are kept as they are. */
    assignNew() {
        this.sources.forEach((genre, name) => {
            if (!this.assignments.has(name)) {
                this.assignments.set(name, [name]);
            }
        });
        this.assignments.forEach((finals) => {
            finals.forEach((final) => this.addFinal(final));
        });
        this.finals.sort(compareNames);
    }

    reloadData() {
        return this.apiClient.getJSON(this.apiClient.getUrl('GenreMapper/Data')).then((data) => {
            this.setData(data);
            this.assignNew();
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

    getCount(name) {
        const genre = this.sources.get(name);
        return genre ? genre.Count : 0;
    }

    /**
     * The original genres in a final genre, with the index of the final genre in their list (an original genre can be in a final genre twice,
     * right after being duplicated), or the removed original genres (with an index of -1) for an empty name.
     */
    getEntries(final) {
        const result = [];
        this.assignments.forEach(function (finals, source) {
            if (!final) {
                if (!finals.length) {
                    result.push({ source: source, index: -1 });
                }
                return;
            }
            finals.forEach(function (assigned, index) {
                if (assigned === final) {
                    result.push({ source: source, index: index });
                }
            });
        });
        return result.sort(function (a, b) {
            return compareNames(a.source, b.source) || a.index - b.index;
        });
    }

    getMapping() {
        const mappings = [];
        this.assignments.forEach(function (finals, source) {
            const unique = finals.filter(function (final, index) {
                return finals.indexOf(final) === index;
            });
            (unique.length ? unique : ['']).forEach(function (final) {
                mappings.push({ Source: source, Target: final });
            });
        });
        return { TargetGenres: this.finals.slice(), Mappings: mappings };
    }

    // -------------------------------------------------------------- mapping

    addFinal(name) {
        if (this.finals.indexOf(name) === -1) {
            this.finals.push(name);
            this.finals.sort(compareNames);
        }
    }

    /** Replaces a final genre in the lists of the original genres, an empty name removes it, without duplicates. */
    replaceFinal(final, name) {
        this.assignments.forEach((finals, source) => {
            const replaced = finals.map(function (assigned) {
                return assigned === final ? name : assigned;
            }).filter(function (assigned, index, list) {
                return assigned && list.indexOf(assigned) === index;
            });
            this.assignments.set(source, replaced);
        });
        this.finals = this.finals.filter(function (other) {
            return other !== final;
        });
    }

    /** Renames a final genre, merging it with the final genre of the new name if it exists. */
    rename(final, name) {
        if (name === final) {
            return;
        }
        this.addFinal(name);
        this.replaceFinal(final, name);
    }

    /** Moves an original genre (one of its copies) into a final genre, or removes it for an empty name. */
    move(source, index, final) {
        const finals = this.assignments.get(source);
        if (index < 0) {
            finals.push(final);
        } else if (!final) {
            finals.splice(index, 1);
        } else if (finals.indexOf(final) === -1) {
            finals[index] = final;
        } else {
            // Already in this final genre
            finals.splice(index, 1);
        }
    }

    /** Adds a copy of an original genre right under it, to move it into another final genre. */
    duplicate(source, index) {
        const finals = this.assignments.get(source);
        finals.splice(index + 1, 0, finals[index]);
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
            + '<div class="gmFinals"></div>'
            + '<div class="gmAdd">'
            + '<label class="inputLabel inputLabelUnfocused" for="gmNewFinal">' + escapeHtml(t('NewFinalGenre')) + '</label>'
            + '<div class="gmAddRow">'
            + '<input type="text" id="gmNewFinal" class="emby-input gmNewFinal" autocomplete="off" />'
            + '<button is="emby-button" type="button" class="raised" data-action="add"><span>' + escapeHtml(t('Add')) + '</span></button>'
            + '</div>'
            + '</div>')
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

        this.renderFinals();
        this.renderStatus();
        if (this.activeTab === 'Preview') {
            this.renderPreview();
        }
    }

    panelHtml(tab, content) {
        return '<div class="gmPanel' + (tab === this.activeTab ? '' : ' hide') + '" data-tab="' + tab + '">' + content + '</div>';
    }

    /** The final genres with their original genres, then the removed genres. */
    renderFinals() {
        const t = this.t;
        const container = this.root.querySelector('.gmFinals');
        const searchInput = this.root.querySelector('.gmSearch');
        const search = normalize(searchInput ? searchInput.value.trim() : '');
        const matches = function (names) {
            return !search || names.some(function (name) {
                return normalize(name).indexOf(search) !== -1;
            });
        };
        const isVisible = (source) => !this.hideUnused || this.getCount(source) > 0;

        // The same options for every select, the current final genre is removed after rendering
        const moveOptions = '<option value="" selected disabled hidden>' + escapeHtml(t('MoveTo')) + '</option>'
            + this.finals.map(function (final) {
                return '<option value="' + escapeHtml(FINAL_PREFIX + final) + '">' + escapeHtml(final) + '</option>';
            }).join('')
            + '<option value="' + REMOVE + '">' + escapeHtml(t('RemoveGenre')) + '</option>';

        const rows = this.finals.map((final) => {
            const allEntries = this.getEntries(final);
            const entries = allEntries.filter((entry) => isVisible(entry.source));
            // The final genres whose original genres are all hidden are hidden too, but not the empty ones
            if ((allEntries.length && !entries.length) || !matches([final].concat(entries.map((entry) => entry.source)))) {
                return '';
            }

            return '<div class="gmFinalCell" data-final="' + escapeHtml(final) + '" style="grid-row:span ' + Math.max(entries.length, 1) + '">'
                + '<input type="text" class="emby-input gmFinalInput" autocomplete="off" value="' + escapeHtml(final) + '" aria-label="' + escapeHtml(t('FinalGenres')) + '" />'
                + this.iconButton('delete', 'delete', t('Delete'))
                + '</div>'
                + (entries.length ? entries.map((entry) => this.sourceHtml(entry, moveOptions)).join('') : '<div class="gmEmpty">' + escapeHtml(t('NoOriginalGenres')) + '</div>')
                + '<div class="gmSeparator"></div>';
        }).join('');

        const removed = this.getEntries('').filter((entry) => isVisible(entry.source) && matches([entry.source]));

        container.innerHTML = (rows || removed.length)
            ? '<div class="gmGrid">'
                + '<div class="gmHeader">' + escapeHtml(t('FinalGenres')) + '</div><div class="gmHeader gmHeaderOriginal">' + escapeHtml(t('OriginalGenres')) + '</div>'
                + '<div class="gmSeparator"></div>'
                + rows
                + (removed.length ? '<div class="gmRemovedTitle" style="grid-row:span ' + removed.length + '">' + escapeHtml(t('RemovedGenres')) + '</div>'
                    + removed.map((entry) => this.sourceHtml(entry, moveOptions)).join('') : '')
                + '</div>'
            : '<p class="fieldDescription">' + escapeHtml(t('NoGenres')) + '</p>';

        container.querySelectorAll('select[data-source]').forEach((select) => {
            const index = Number(select.getAttribute('data-index'));
            const final = index < 0 ? '' : this.assignments.get(select.getAttribute('data-source'))[index];
            const current = select.querySelector('option[value="' + CSS.escape(final ? FINAL_PREFIX + final : REMOVE) + '"]');
            if (current) {
                current.remove();
            }
            select.value = '';
        });

        this.alignFinalInputs();
    }

    /** Gives all the final genre fields the width of the longest name (and at least of the removed genres title), so the columns stay aligned. */
    alignFinalInputs() {
        const inputs = this.root.querySelectorAll('.gmFinalInput');
        const context = inputs.length ? document.createElement('canvas').getContext('2d') : null;
        if (!context) {
            return;
        }

        context.font = getComputedStyle(inputs[0]).font;
        const names = Array.from(inputs, function (input) {
            return input.value;
        }).concat([this.t('RemovedGenres')]);
        const width = Math.max.apply(null, names.map(function (name) {
            return context.measureText(name).width;
        }));
        // A little more than the text, for the cursor and the next letters
        this.root.querySelector('.gmGrid').style.setProperty('--gmFinalWidth', Math.ceil(Math.max(width, 80) + 16) + 'px');
    }

    /** A row of an original genre: arrow to its final genre, name, "Move to" select and duplicate button (except for the removed genres). */
    sourceHtml(entry, moveOptions) {
        const source = entry.source;
        const genre = this.sources.get(source);
        const badges = (genre ? genre.Origins : []).map(function (origin) {
            return '<span class="gmBadge">' + escapeHtml(origin) + '</span>';
        }).join('');

        const data = ' data-source="' + escapeHtml(source) + '" data-index="' + entry.index + '"';

        return '<div class="gmArrow"><span class="material-icons arrow_back" aria-hidden="true"></span></div>'
            + '<div class="gmSourceName">' + escapeHtml(source) + '<span class="gmCount">' + escapeHtml(this.t.count(this.getCount(source))) + '</span>' + badges + '</div>'
            + '<div class="gmSourceSelect"><div class="selectContainer"><select is="emby-select"' + data + ' aria-label="'
            + escapeHtml(this.t('MoveTo')) + '">' + moveOptions + '</select></div></div>'
            + (entry.index < 0 ? '' : '<div class="gmActions"' + data + '>'
                + this.iconButton('duplicate', 'content_copy', this.t('Duplicate'))
                // Only the copies can be removed here, an original genre in a single final genre is removed with "Move to"
                + this.iconButton('removeCopy', 'delete', this.t('RemoveCopy'), this.assignments.get(source).length < 2)
                + '</div>');
    }

    iconButton(action, icon, title, disabled) {
        return '<button type="button" class="paper-icon-button-light" data-action="' + action + '" title="' + escapeHtml(title) + '"' + (disabled ? ' disabled' : '') + '>'
            + '<span class="material-icons ' + icon + '" aria-hidden="true"></span></button>';
    }

    renderPreview() {
        const t = this.t;
        const container = this.root.querySelector('.gmPreview');
        container.innerHTML = '';
        Dashboard.showLoadingMsg();

        return this.apiClient.ajax({
            type: 'POST',
            url: this.apiClient.getUrl('GenreMapper/Preview'),
            data: JSON.stringify({ Mappings: this.getMapping().Mappings }),
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

    /** Shows the progress of the task applying the mapping, refreshed while it runs. */
    renderStatus() {
        const container = this.root.querySelector('.gmStatus');
        if (!container) {
            return;
        }
        const task = this.applyTask;
        container.textContent = task ? this.t('StatusApply', { progress: Math.round(task.CurrentProgressPercentage || 0) }) : '';
        container.classList.toggle('hide', !task);
    }

    pollStatus() {
        clearTimeout(this.statusTimer);
        if (!this.root.isConnected) {
            return;
        }

        this.apiClient.getJSON(this.apiClient.getUrl('ScheduledTasks')).then((tasks) => {
            const wasRunning = this.applyTask !== null;
            this.applyTask = tasks.find(function (task) {
                return task.Key === APPLY_TASK && task.State !== 'Idle';
            }) || null;
            this.renderStatus();

            if (this.applyTask || Date.now() < this.pollUntil) {
                this.statusTimer = setTimeout(() => this.pollStatus(), 2000);
            }
            if (wasRunning && !this.applyTask) {
                // The genres of the items changed
                this.reloadData();
            }
        }).catch(function (error) {
            console.error(LOG_PREFIX, error);
        });
    }

    /** Polls the status of the task for a few seconds at least, the time for a queued task to start. */
    watchTask() {
        this.pollUntil = Date.now() + 8000;
        this.pollStatus();
    }

    // ---------------------------------------------------------------- events

    onClick(event) {
        const button = event.target.closest('[data-action]');
        if (!button) {
            return;
        }

        const cell = button.closest('.gmFinalCell');
        const final = cell ? cell.getAttribute('data-final') : null;

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
            case 'add': {
                const input = this.root.querySelector('.gmNewFinal');
                const name = input.value.trim();
                if (name) {
                    this.addFinal(name);
                    input.value = '';
                    this.renderFinals();
                }
                break;
            }
            case 'delete':
                this.deleteFinal(final);
                break;
            case 'duplicate':
            case 'removeCopy': {
                const actions = button.closest('.gmActions');
                const source = actions.getAttribute('data-source');
                const index = Number(actions.getAttribute('data-index'));
                if (button.getAttribute('data-action') === 'duplicate') {
                    this.duplicate(source, index);
                } else {
                    this.assignments.get(source).splice(index, 1);
                }
                this.renderFinals();
                break;
            }
            default:
                break;
        }
    }

    /** Deletes a final genre, its original genres are removed from the items. */
    deleteFinal(final) {
        this.replaceFinal(final, '');
        this.renderFinals();
    }

    /** Enter in a text field runs its action instead of saving the form, Escape cancels the renaming of a final genre. */
    onKeyDown(event) {
        const target = event.target;
        if (target.tagName !== 'INPUT' || (event.key !== 'Enter' && event.key !== 'Escape')) {
            return;
        }

        if (target.classList.contains('gmFinalInput')) {
            event.preventDefault();
            if (event.key === 'Escape') {
                target.value = target.closest('.gmFinalCell').getAttribute('data-final');
            }
            // Renamed by the change event
            target.blur();
        } else if (event.key === 'Enter' && (target.classList.contains('gmNewFinal') || target.type === 'search')) {
            event.preventDefault();
            if (target.classList.contains('gmNewFinal')) {
                this.root.querySelector('[data-action="add"]').click();
            }
        }
    }

    onInput(event) {
        if (event.target.classList.contains('gmSearch')) {
            this.renderFinals();
        }
    }

    onChange(event) {
        const element = event.target;
        const source = element.getAttribute('data-source');

        if (element.classList.contains('gmFinalInput')) {
            const final = element.closest('.gmFinalCell').getAttribute('data-final');
            const name = element.value.trim();
            if (name && name !== final) {
                this.rename(final, name);
                this.renderFinals();
            } else {
                element.value = final;
            }
        } else if (source !== null) {
            if (element.value) {
                this.move(source, Number(element.getAttribute('data-index')), element.value === REMOVE ? '' : element.value.substring(FINAL_PREFIX.length));
                this.renderFinals();
            }
        } else if (element.classList.contains('gmHideUnused')) {
            this.hideUnused = element.checked;
            this.renderFinals();
        } else if (element.getAttribute('data-field')) {
            const field = element.getAttribute('data-field');
            this.config[field] = element.value.trim();
            if (field === 'Language') {
                this.loadTranslations().then(() => this.render());
            }
        }
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
            this.watchTask();
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
                this.watchTask();
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
 * @param {Object} data The data of the page (version, languages and original genres).
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
