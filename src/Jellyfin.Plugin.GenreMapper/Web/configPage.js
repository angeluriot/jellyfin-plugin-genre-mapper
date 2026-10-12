/**
 * Genre Mapper - configuration page.
 * Edits the target genres and the mapping with the built-in plugin configuration API, previews the changes and resets the genres.
 */

const PLUGIN_ID = 'd92c00c2-a490-44ec-9822-d2db5bdbfd0e';

const LOG_PREFIX = '[GenreMapper]';

const TABS = ['Genres', 'Mapping', 'Preview', 'Settings'];

// The scheduled tasks of the plugin, with the translation of their status
const TASKS = { GenreMapperApply: 'StatusApply', GenreMapperRestore: 'StatusRestore' };

// Values of the mapping selects: keep the genre, remove it, or replace it with a target genre (prefix + name)
const KEEP = 'k';
const REMOVE = 'r';
const TARGET_PREFIX = 't';

const STYLE = '<style>'
    + '.gmTabs{display:flex;flex-wrap:wrap;margin:0.5em 0 1.5em;border-bottom:1px solid var(--jf-palette-divider,rgba(255,255,255,.12))}'
    + '.gmTab{background:none;border:0;border-bottom:2px solid transparent;color:inherit;cursor:pointer;font:inherit;opacity:.7;padding:.8em 1.2em}'
    + '.gmTab-active{border-bottom-color:var(--jf-palette-primary-main,#00a4dc);opacity:1}'
    + '.gmRow{display:flex;align-items:center;gap:1em;padding:.4em 0;border-bottom:1px solid var(--jf-palette-divider,rgba(128,128,128,.2))}'
    + '.gmName{flex:1;min-width:0;overflow-wrap:anywhere}'
    + '.gmSecondary{opacity:.6;font-size:.9em;margin-top:.2em}'
    + '.gmBadge{display:inline-block;font-size:.75em;padding:.1em .6em;border-radius:1em;background:rgba(128,128,128,.25);margin-left:.5em;vertical-align:middle}'
    + '.gmRow .selectContainer{margin:0;flex:0 0 40%;max-width:20em}'
    + '.gmRow .selectLabel{display:none}'
    + '.gmRow .selectArrowContainer{top:0;bottom:0;display:flex;align-items:center}.gmRow .selectArrow{margin:0}'
    + '.gmInline{display:flex;align-items:flex-end;gap:1em;margin-bottom:1em}.gmInline .inputContainer,.gmInline .selectContainer{flex:1;margin:0}'
    + '.gmInline .emby-button{margin:0;flex:none}'
    + '.gmEditor{padding:1em 0 .5em 1em}'
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

/** A comparable form of a genre name: without case, accents, spaces or punctuation. */
function normalize(name) {
    return String(name).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
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
        this.editingTarget = null;
        this.suggestions = [];
        this.hideUnused = false;
        this.statusTimer = null;
        this.pollUntil = 0;
        this.runningTasks = [];
        this.t = null;
        this.setData(data);
        this.initMapping();
        this.suggestionLanguage = this.data.MetadataLanguages[0] || 'en';

        this.root.addEventListener('click', this.onClick.bind(this));
        this.root.addEventListener('change', this.onChange.bind(this));
        this.root.addEventListener('input', this.onInput.bind(this));
        this.root.addEventListener('submit', this.onSubmit.bind(this));
        this.root.addEventListener('keydown', this.onKeyDown.bind(this));
    }

    // ------------------------------------------------------------------ data

    /** The known source genres by name, including the ones of the saved mapping that are not known anymore. */
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

    /** Builds the target genres and the links of the other genres from the configuration, like the server does. */
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

        // The genres without mapping (like the new ones) are kept as they are
        this.sources.forEach((genre, name) => {
            if (this.targets.indexOf(name) === -1 && !this.links.has(name)) {
                this.targets.push(name);
            }
        });
        this.sortTargets();
    }

    reloadData() {
        return this.apiClient.getJSON(this.apiClient.getUrl('GenreMapper/Data')).then((data) => {
            this.setData(data);
            // New genres are kept as they are
            this.sources.forEach((genre, name) => {
                if (this.targets.indexOf(name) === -1 && !this.links.has(name)) {
                    this.targets.push(name);
                }
            });
            this.sortTargets();
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

    sortTargets() {
        this.targets.sort(compareNames);
    }

    isTarget(name) {
        return this.targets.indexOf(name) !== -1;
    }

    getCount(name) {
        const genre = this.sources.get(name);
        return genre ? genre.Count : 0;
    }

    /** The genres replaced by a target genre (without itself). */
    getLinkedSources(target) {
        const result = [];
        this.links.forEach(function (linked, source) {
            if (linked === target) {
                result.push(source);
            }
        });
        return result.sort(compareNames);
    }

    /** Approximate number of items of a target genre after the mapping (an item can have several of its genres). */
    getTargetCount(target) {
        return this.getLinkedSources(target).reduce((total, source) => total + this.getCount(source), this.getCount(target));
    }

    // -------------------------------------------------------------- mapping

    addTarget(name) {
        if (!this.isTarget(name)) {
            this.targets.push(name);
            this.sortTargets();
        }
        // A target genre is always kept
        this.links.delete(name);
    }

    /**
     * Replaces a target genre with another one (renaming or merging it), or removes it if the new target is empty:
     * the genre and the genres it replaces are linked to the new target.
     */
    retarget(from, to) {
        if (from === to) {
            return;
        }
        if (to) {
            this.addTarget(to);
        }
        this.getLinkedSources(from).forEach((source) => {
            this.links.set(source, to);
        });
        this.targets = this.targets.filter(function (target) {
            return target !== from;
        });
        if (this.sources.has(from)) {
            this.links.set(from, to);
        }
        if (this.editingTarget === from) {
            this.editingTarget = null;
        }
    }

    /** Changes the mapping of a source genre from the Mapping tab. */
    setMapping(source, value) {
        if (value === KEEP) {
            this.addTarget(source);
            return;
        }

        const target = value === REMOVE ? '' : value.substring(TARGET_PREFIX.length);
        if (this.isTarget(source)) {
            this.retarget(source, target);
        } else {
            this.links.set(source, target);
        }
    }

    /**
     * Suggests merges of the target genres that look like duplicates (same name without case, accents, spaces or punctuation)
     * or translations (same official genre), into their name in the chosen language if known, the most used one otherwise.
     */
    computeSuggestions() {
        const concepts = this.data.Concepts;
        const languages = this.data.MetadataLanguages.concat([this.suggestionLanguage]);
        const conceptByKey = new Map();

        concepts.forEach(function (concept, index) {
            const names = concept.Tvdb ? [concept.Tvdb] : [];
            languages.forEach(function (language) {
                Array.prototype.push.apply(names, concept.Aliases[language] || []);
            });
            names.forEach(function (name) {
                const key = normalize(name);
                if (key && !conceptByKey.has(key)) {
                    conceptByKey.set(key, index);
                }
            });
        });

        // Groups of equivalent target genres (union-find)
        const targets = this.targets;
        const parents = targets.map(function (target, index) {
            return index;
        });
        const find = function (index) {
            while (parents[index] !== index) {
                parents[index] = parents[parents[index]];
                index = parents[index];
            }
            return index;
        };
        const firstByKey = new Map();
        targets.forEach(function (target, index) {
            const key = normalize(target);
            const keys = ['n' + key];
            if (conceptByKey.has(key)) {
                keys.push('c' + conceptByKey.get(key));
            }
            keys.forEach(function (groupKey) {
                if (firstByKey.has(groupKey)) {
                    parents[find(index)] = find(firstByKey.get(groupKey));
                } else {
                    firstByKey.set(groupKey, index);
                }
            });
        });

        const groups = new Map();
        targets.forEach(function (target, index) {
            const root = find(index);
            if (!groups.has(root)) {
                groups.set(root, []);
            }
            groups.get(root).push(target);
        });

        const counts = new Map(targets.map((target) => [target, this.getTargetCount(target)]));
        const byCount = function (a, b) {
            return counts.get(b) - counts.get(a) || compareNames(a, b);
        };

        const suggestions = [];
        groups.forEach((members) => {
            members.sort(byCount);

            let preferred = null;
            const withConcept = members.find(function (member) {
                return conceptByKey.has(normalize(member));
            });
            if (withConcept) {
                preferred = concepts[conceptByKey.get(normalize(withConcept))].Names[this.suggestionLanguage] || null;
            }
            if (!preferred) {
                if (members.length < 2) {
                    return;
                }
                preferred = members[0];
            }

            members.forEach(function (member) {
                if (member !== preferred) {
                    suggestions.push({ From: member, To: preferred, Count: counts.get(member) });
                }
            });
        });

        this.suggestions = suggestions.sort(function (a, b) {
            return b.Count - a.Count || compareNames(a.From, b.From);
        });
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
            + '<div class="gmSuggestions"></div>'
            + '<div class="inputContainer"><input is="emby-input" type="search" class="gmTargetSearch" autocomplete="off" label="' + escapeHtml(t('Search')) + '" /></div>'
            + '<div class="gmTargets"></div>'
            + '<div class="gmInline" style="margin-top:1.5em">'
            + '<div class="inputContainer"><input is="emby-input" type="text" class="gmNewTarget" autocomplete="off" label="' + escapeHtml(t('NewGenre')) + '" /></div>'
            + '<button is="emby-button" type="button" class="raised" data-action="addTarget"><span>' + escapeHtml(t('Add')) + '</span></button>'
            + '</div>')
            + this.panelHtml('Mapping', ''
            + '<p class="fieldDescription">' + escapeHtml(t('MappingHelp')) + '</p>'
            + '<div class="inputContainer"><input is="emby-input" type="search" class="gmSourceSearch" autocomplete="off" label="' + escapeHtml(t('Search')) + '" /></div>'
            + '<label class="checkboxContainer"><input is="emby-checkbox" type="checkbox" class="gmHideUnused"' + (this.hideUnused ? ' checked' : '') + ' />'
            + '<span>' + escapeHtml(t('HideUnused')) + '</span></label>'
            + '<div class="gmSources"></div>')
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

        this.refresh();
        this.renderStatus();
        if (this.activeTab === 'Preview') {
            this.renderPreview();
        }
    }

    panelHtml(tab, content) {
        return '<div class="gmPanel' + (tab === this.activeTab ? '' : ' hide') + '" data-tab="' + tab + '">' + content + '</div>';
    }

    /** Re-renders the parts depending on the mapping. */
    refresh() {
        this.computeSuggestions();
        this.renderSuggestions();
        this.renderTargets();
        this.renderSources();
    }

    iconButton(action, icon, title) {
        return '<button is="paper-icon-button-light" type="button" data-action="' + action + '" title="' + escapeHtml(title) + '">'
            + '<span class="material-icons ' + icon + '" aria-hidden="true"></span></button>';
    }

    renderSuggestions() {
        const t = this.t;
        const container = this.root.querySelector('.gmSuggestions');

        const languages = new Set();
        this.data.Concepts.forEach(function (concept) {
            Object.keys(concept.Names).forEach(function (language) {
                languages.add(language);
            });
        });
        let displayNames = null;
        try {
            displayNames = new Intl.DisplayNames([this.uiLanguage], { type: 'language' });
        } catch (error) {
            console.warn(LOG_PREFIX, error);
        }
        const languageOptions = Array.from(languages).map(function (code) {
            let label = code;
            try {
                label = displayNames ? displayNames.of(code) || code : code;
            } catch (error) {
                label = code;
            }
            return { value: code, label: label.charAt(0).toLocaleUpperCase() + label.slice(1) };
        }).sort(function (a, b) {
            return compareNames(a.label, b.label);
        });

        const rows = this.suggestions.map((suggestion, index) => {
            return '<div class="gmRow">'
                + '<div class="gmName">' + escapeHtml(suggestion.From) + ' <span class="gmSecondary">(' + escapeHtml(t.count(suggestion.Count)) + ')</span>'
                + ' → <b>' + escapeHtml(suggestion.To) + '</b></div>'
                + '<button is="emby-button" type="button" class="raised" data-action="suggestion" data-index="' + index + '" style="margin:0"><span>'
                + escapeHtml(t('Merge')) + '</span></button>'
                + '</div>';
        }).join('');

        container.innerHTML = '<div class="gmBox"><h3>' + escapeHtml(t('Suggestions')) + '</h3>'
            + '<p class="fieldDescription">' + escapeHtml(t('SuggestionsHelp')) + '</p>'
            + '<div class="gmInline">'
            + '<div class="selectContainer"><select is="emby-select" class="gmSuggestionLanguage" label="' + escapeHtml(t('SuggestionsLanguage')) + '">'
            + optionsHtml(languageOptions, this.suggestionLanguage) + '</select></div>'
            + (this.suggestions.length ? '<button is="emby-button" type="button" class="raised" data-action="allSuggestions"><span>'
                + escapeHtml(t('MergeAll')) + '</span></button>' : '')
            + '</div>'
            + (rows || '<p class="fieldDescription">' + escapeHtml(t('NoGenres')) + '</p>')
            + '</div>';
    }

    matchesSearch(name, selector) {
        const input = this.root.querySelector(selector);
        const search = normalize(input ? input.value : '');
        return !search || normalize(name).indexOf(search) !== -1;
    }

    renderTargets() {
        const t = this.t;
        const container = this.root.querySelector('.gmTargets');
        const targets = this.targets.filter((target) => this.matchesSearch(target, '.gmTargetSearch'));

        if (!targets.length) {
            container.innerHTML = '<p class="fieldDescription">' + escapeHtml(t('NoGenres')) + '</p>';
            return;
        }

        container.innerHTML = targets.map((target) => {
            const linked = this.getLinkedSources(target);
            const details = [t.count(this.getTargetCount(target))];
            if (linked.length) {
                details.push(t('Replaces', { genres: linked.join(', ') }));
            }

            return '<div class="gmTarget" data-name="' + escapeHtml(target) + '">'
                + '<div class="gmRow">'
                + '<div class="gmName"><div>' + escapeHtml(target) + '</div><div class="gmSecondary">' + escapeHtml(details.join(' · ')) + '</div></div>'
                + this.iconButton('edit', 'edit', t('Edit'))
                + this.iconButton('remove', 'delete', t('Remove'))
                + '</div>'
                + (this.editingTarget === target ? this.editorHtml(target) : '')
                + '</div>';
        }).join('');
    }

    /** Rename and merge fields of a target genre. */
    editorHtml(target) {
        const t = this.t;
        const mergeOptions = [{ value: '', label: t('Select') }].concat(this.targets.filter(function (other) {
            return other !== target;
        }).map(function (other) {
            return { value: other, label: other };
        }));

        return '<div class="gmEditor">'
            + '<div class="gmInline">'
            + '<div class="inputContainer"><input is="emby-input" type="text" class="gmRenameInput" autocomplete="off" label="' + escapeHtml(t('Name'))
            + '" value="' + escapeHtml(target) + '" /></div>'
            + '<button is="emby-button" type="button" class="raised" data-action="rename"><span>' + escapeHtml(t('Rename')) + '</span></button>'
            + '</div>'
            + '<div class="gmInline">'
            + '<div class="selectContainer"><select is="emby-select" class="gmMergeSelect" label="' + escapeHtml(t('MergeInto')) + '">'
            + optionsHtml(mergeOptions, '') + '</select></div>'
            + '<button is="emby-button" type="button" class="raised" data-action="merge"><span>' + escapeHtml(t('Merge')) + '</span></button>'
            + '</div>'
            + '</div>';
    }

    renderSources() {
        const t = this.t;
        const container = this.root.querySelector('.gmSources');
        const names = Array.from(this.sources.keys()).filter((name) => {
            return (!this.hideUnused || this.getCount(name) > 0) && this.matchesSearch(name, '.gmSourceSearch');
        }).sort(compareNames);

        if (!names.length) {
            container.innerHTML = '<p class="fieldDescription">' + escapeHtml(t('NoGenres')) + '</p>';
            return;
        }

        const targetOptions = this.targets.map(function (target) {
            return '<option value="' + escapeHtml(TARGET_PREFIX + target) + '">' + escapeHtml(target) + '</option>';
        }).join('');

        container.innerHTML = names.map((name) => {
            const genre = this.sources.get(name);
            const badges = genre.Origins.map(function (origin) {
                return '<span class="gmBadge">' + escapeHtml(t('Origin' + origin)) + '</span>';
            }).join('');

            let value = KEEP;
            if (!this.isTarget(name)) {
                const target = this.links.get(name);
                value = target ? TARGET_PREFIX + target : REMOVE;
            }

            // The selected option is set after rendering, the options being shared by all the rows
            return '<div class="gmRow">'
                + '<div class="gmName"><div>' + escapeHtml(name) + badges + '</div><div class="gmSecondary">' + escapeHtml(t.count(genre.Count)) + '</div></div>'
                + '<div class="selectContainer"><select is="emby-select" class="gmMappingSelect" data-source="' + escapeHtml(name) + '" data-value="' + escapeHtml(value) + '">'
                + '<option value="' + KEEP + '">' + escapeHtml(t('Keep')) + '</option>'
                + '<optgroup label="' + escapeHtml(t('ReplaceWith')) + '">' + targetOptions + '</optgroup>'
                + '<option value="' + REMOVE + '">' + escapeHtml(t('RemoveGenre')) + '</option>'
                + '</select></div>'
                + '</div>';
        }).join('');

        container.querySelectorAll('.gmMappingSelect').forEach(function (select) {
            select.value = select.getAttribute('data-value');
            // A genre cannot be replaced with itself
            const own = select.querySelector('option[value="' + CSS.escape(TARGET_PREFIX + select.getAttribute('data-source')) + '"]');
            if (own) {
                own.remove();
            }
        });
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

    getMapping() {
        const mappings = [];
        this.links.forEach(function (target, source) {
            mappings.push({ Source: source, Target: target });
        });
        return { TargetGenres: this.targets.slice(), Mappings: mappings };
    }

    onClick(event) {
        const button = event.target.closest('[data-action]');
        if (!button) {
            return;
        }

        const action = button.getAttribute('data-action');
        const row = button.closest('.gmTarget');
        const target = row ? row.getAttribute('data-name') : null;

        switch (action) {
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
                return;
            case 'preview':
                this.renderPreview();
                return;
            case 'reset':
                this.reset();
                return;
            case 'suggestion': {
                const suggestion = this.suggestions[Number(button.getAttribute('data-index'))];
                this.retarget(suggestion.From, suggestion.To);
                break;
            }
            case 'allSuggestions':
                this.suggestions.forEach((suggestion) => {
                    this.retarget(suggestion.From, suggestion.To);
                });
                break;
            case 'addTarget': {
                const input = this.root.querySelector('.gmNewTarget');
                const name = input.value.trim();
                if (!name) {
                    return;
                }
                this.addTarget(name);
                input.value = '';
                break;
            }
            case 'edit':
                this.editingTarget = this.editingTarget === target ? null : target;
                break;
            case 'rename': {
                const name = row.querySelector('.gmRenameInput').value.trim();
                if (!name) {
                    return;
                }
                this.retarget(target, name);
                break;
            }
            case 'merge': {
                const name = row.querySelector('.gmMergeSelect').value;
                if (!name) {
                    return;
                }
                this.retarget(target, name);
                break;
            }
            case 'remove': {
                const count = this.getTargetCount(target);
                if (count > 0) {
                    confirmDialog(this.t('RemoveConfirm', { genre: target, count: count }), this.t('RemoveTitle')).then((confirmed) => {
                        if (confirmed) {
                            this.retarget(target, '');
                            this.refresh();
                        }
                    });
                    return;
                }
                this.retarget(target, '');
                break;
            }
            default:
                return;
        }

        this.refresh();
    }

    /** Enter in a text field runs the action of its button instead of saving the form. */
    onKeyDown(event) {
        if (event.key !== 'Enter' || event.target.tagName !== 'INPUT') {
            return;
        }

        event.preventDefault();
        const actions = { gmNewTarget: 'addTarget', gmRenameInput: 'rename' };
        const className = Object.keys(actions).find(function (name) {
            return event.target.classList.contains(name);
        });
        const container = event.target.closest('.gmInline');
        const button = className && container ? container.querySelector('[data-action="' + actions[className] + '"]') : null;
        if (button) {
            button.click();
        }
    }

    onInput(event) {
        if (event.target.classList.contains('gmTargetSearch')) {
            this.renderTargets();
        } else if (event.target.classList.contains('gmSourceSearch')) {
            this.renderSources();
        }
    }

    onChange(event) {
        const element = event.target;

        if (element.classList.contains('gmMappingSelect')) {
            this.setMapping(element.getAttribute('data-source'), element.value);
            this.refresh();
        } else if (element.classList.contains('gmHideUnused')) {
            this.hideUnused = element.checked;
            this.renderSources();
        } else if (element.classList.contains('gmSuggestionLanguage')) {
            this.suggestionLanguage = element.value;
            this.computeSuggestions();
            this.renderSuggestions();
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
 * @param {Object} data The data of the page (version, languages, known genres and their translations).
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
