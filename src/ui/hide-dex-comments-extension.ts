import { 
	ViewPlugin, 
	ViewUpdate, 
	Decoration, 
	DecorationSet,
	EditorView
} from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import type DexContactsPlugin from '../../main';

/**
 * Decoration to hide Dex metadata comments in Live Preview mode
 */
const hideDexCommentMark = Decoration.mark({
	class: 'dex-hidden-comment',
	attributes: { 
		'aria-label': 'Dex metadata (hidden)',
		'title': 'Dex metadata - switch to Source mode to view'
	}
});

/**
 * CodeMirror 6 extension that conditionally hides %%dex:...%% comments in Live Preview mode
 * based on the hideDexMetadata setting.
 * 
 * Comments are shown when the cursor is inside them, hidden otherwise.
 */
export const createHideDexCommentsExtension = (plugin: DexContactsPlugin) => ViewPlugin.fromClass(
	class {
		decorations: DecorationSet;
		plugin: DexContactsPlugin;

		constructor(view: EditorView) {
			this.plugin = plugin;
			this.decorations = this.buildDecorations(view);
		}

		update(update: ViewUpdate) {
			// Rebuild decorations when document changes, viewport changes, or selection changes
			if (update.docChanged || update.viewportChanged || update.selectionSet) {
				this.decorations = this.buildDecorations(update.view);
			}
		}

		buildDecorations(view: EditorView): DecorationSet {
			// Only hide comments if the setting is enabled
			if (!this.plugin.settings?.hideDexMetadata) {
				return Decoration.none;
			}

			const builder = new RangeSetBuilder<Decoration>();
			
			// Get current cursor position(s)
			const cursorPositions = view.state.selection.ranges.map(range => ({
				from: range.from,
				to: range.to
			}));
			
			// Regex to match Dex comments: %%dex:contact-id=X,memo-id=Y,hash=Z%%
			// Also matches simpler forms: %%dex:contact-id=X%% (for contact-only spans)
			const dexCommentRegex = /%%dex:[^%]*%%/g;

			// Only process visible ranges for performance
			for (let { from, to } of view.visibleRanges) {
				const text = view.state.doc.sliceString(from, to);
				let match;
				
				while ((match = dexCommentRegex.exec(text)) !== null) {
					const startPos = from + match.index;
					const endPos = startPos + match[0].length;
					
					// Check if cursor is inside this comment
					const cursorInComment = cursorPositions.some(cursor => 
						(cursor.from >= startPos && cursor.from <= endPos) ||
						(cursor.to >= startPos && cursor.to <= endPos) ||
						(cursor.from <= startPos && cursor.to >= endPos)
					);
					
					// Only hide if cursor is NOT inside the comment
					if (!cursorInComment) {
						builder.add(startPos, endPos, hideDexCommentMark);
					}
				}
			}

			return builder.finish();
		}
	},
	{
		decorations: (v) => v.decorations,
	}
);
