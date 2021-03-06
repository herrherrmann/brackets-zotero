define(function (require, exports, module) {
    'use strict';

    // Brackets Modules
    var EditorManager = brackets.getModule("editor/EditorManager");
    var DocumentManager = brackets.getModule('document/DocumentManager');
    var _ = brackets.getModule("thirdparty/lodash");

    // Local Modules
    var Channel = require("src/utils/Channel")
    var Events = require("src/utils/Events")
    var settings = JSON.parse(require('text!settings.json'));
    var C = require("src/utils/Constants");


    function extractKeysFromText(fileContents) {
//        console.log("SCAN: Extracting citation keys...")
        var keys = []
        var match = fileContents.match(C.REGEXP_MATCH_BRACKETS)
        _.forEach(match, function (citesEnclosedInBrackets) {
            var items = citesEnclosedInBrackets.match(C.REGEXP_CITE_KEYS)
            _.forEach(items, function (citeKey) {
                // removing `@` prefix by slicing citeKey
                keys.push(citeKey.slice(1))
            })
        })
        return _.uniq(keys)
    }

    function _indexKeysLocations( fileContents, keys ) {
        var lines = fileContents.split("\n")
        var lineCount = 0; // 0-based line count
        var selectionKeys = {}
        _.forEach( lines, function(line) {
            _.forEach( keys, function (key) {
                if (!selectionKeys[key]) selectionKeys[key] = []
                var re = new RegExp(key, 'g')
                var match;
                while ((match = re.exec(line)) != null) {
                    var obj = { line: lineCount,
                                index: match.index,
                                current: false, }
                    selectionKeys[key].push(obj)
                }
            })
            lineCount++
        })
        _.forEach( selectionKeys, function( array ) {
            array[0].current = true
        })
        return selectionKeys
    }

    function _getEditor(editor) {
        // getting editor if no editor provided
        if (!editor) editor = EditorManager.getCurrentFullEditor();
        // if still no editor found, throwing error
        if (!editor) {
//            console.log("No Editor found!")
            return false
        }
        return editor
    }

//    function _updateDocumentPath(editor) {
//        this.path = editor.document.file._path
//        return this.path
//    }

    function _getFileExtension(editor) {
        return editor.document.file._path.split(".").slice(-1)[0];
    }

    function _getNextKey(key) {
        var col = this.keysLocationHash[key]
        var length = col.length
        var index = 0
        var currentItem = null
        _.forEach( col, function( item, idx ) {
            if (!!item.current) {
                index = idx
                currentItem = item
            }
        })
        this.keysLocationHash[key][index].current = false
        if ( index == length-1 ) {
            this.keysLocationHash[key][0].current = true
        } else {
            this.keysLocationHash[key][index+1].current = true
        }
        return currentItem
    }

    function _handleHighightCites(key) {
        var editor = EditorManager.getCurrentFullEditor();
        if (!editor) return false
        var curentCite = _.bind( _getNextKey, this )( key.slice(1) )
        editor.setCursorPos( curentCite.line, curentCite.index, true)
        editor.selectWordAt(editor.getSelection().start)
    }

    function _handleFileScan(editor) {
//        console.log("Scan Requested...")

        editor = _getEditor(editor)
        if (!editor) return false

        var fileExtension = _getFileExtension(editor)
        if (!_.contains(settings.docTypesToScanForCitationKeys, fileExtension)) {
//            console.log("Scan Requested...Aborting: '" + fileExtension + "' files not allowed to scan!")
            return false
        }

        var panelVisible = Channel.UI.request(Events.REQUEST_PANEL_VISIBILITY_STATUS)
//        console.log("PANEL-VISIBILITY", panelVisible)
        if (!panelVisible) {
//            console.log("Scan Requested...Aborting: Panel is not visible!")
            return false
        }

//        var prevPath = this.path
//        var path = _.bind(_updateDocumentPath, this)(editor)
//        if (path == prevPath && this.scanned) {
//            console.log("Scan Requested...Aborting: Same scanned document!")
//            return false
//        }

//        console.log("Scan Requested...scanning!")
        var fileContents = editor.document.getText()
        if (!fileContents) return []
        var keys = extractKeysFromText(fileContents)
        if (keys.length) {
            this.extractedKeys = keys
            Channel.Zotero.trigger(Events.EVENT_CITEKEYS_FOUND, keys)
            this.keysLocationHash = _indexKeysLocations( fileContents, keys )
        }

        this.scanned = true
    }

    // insert the selected key into document at the current cursor position
    function _handleInserCitation() {
        var citeString = Channel.Zotero.request(Events.REQUEST_CITE_STRING)
        if (!citeString) return
        _insertText(citeString)
    }

    function _handleInsertBibliography() {
        var biblioStringPromise = Channel.Zotero.request(Events.REQUEST_BIBLIOGRAPHY)
        if (!biblioStringPromise) throw new Error("Error Inserting Bibliography in the Document")
        biblioStringPromise.then(function (data) {
            _insertText(data.result)
        })
    }

    function _insertText(string) {
        var editor = EditorManager.getCurrentFullEditor();
        var doc = DocumentManager.getCurrentDocument();
        var selections = editor.getSelections();
        var edits = []

        _.forEach(selections, function(sel) {
            edits.push({edit: {text: string, start: sel.start, end: sel.end}})
        })

        doc.doMultipleEdits(edits)
    }

    function _init() {
//        console.log("initializing Document...")

        Channel.Document.comply( Events.COMMAND_HIGHLIGHT_CITES, _.bind(_handleHighightCites, this) )
        Channel.Extension.on(Events.EVENT_PANEL_SHOWN, _.bind(_handleFileScan, this))
        Channel.Extension.on(Events.EVENT_EDITOR_CHANGE, _.bind(_handleFileScan, this))

        Channel.Extension.comply(C.CMD_ID_INSERT_CITE, _handleInserCitation)
        Channel.Extension.comply(C.CMD_ID_INSERT_BIBLIO, _handleInsertBibliography)

//        console.log("initializing Document...COMPLETE")
    }

    function Document() {
        this.scanned = false
        this.extractedKeys = []
        this.keysLocationHash = {}
//        this.path = ''
        Channel.Extension.on(Events.EVENT_INIT, _.bind(_init, this))
    }

    module.exports = new Document()

});
