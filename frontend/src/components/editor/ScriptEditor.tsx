import { useEffect, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Box, Stack, IconButton, Tooltip, Divider, ButtonGroup, Button } from '@mui/material';
import FormatBoldIcon from '@mui/icons-material/FormatBold';
import FormatItalicIcon from '@mui/icons-material/FormatItalic';
import FormatUnderlinedIcon from '@mui/icons-material/FormatUnderlined';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';
import { useDebounce } from '../../hooks/useDebounce';

interface Props {
  initialContent: string;
  onChange?: (content: string, plainText: string) => void;
  editable?: boolean;
}

export function ScriptEditor({ initialContent, onChange, editable = true }: Props): JSX.Element {
  const [plainText, setPlainText] = useState('');
  const debounced = useDebounce(plainText, 5000);

  const editor = useEditor({
    extensions: [StarterKit, Placeholder.configure({ placeholder: '脚本将自动保存...' })],
    content: initialContent || '<p></p>',
    editable,
    onUpdate: ({ editor: e }) => {
      const txt = e.getText();
      setPlainText(txt);
      onChange?.(JSON.stringify(e.getJSON()), txt);
    },
  });

  useEffect(() => {
    if (debounced) onChange?.(JSON.stringify(editor?.getJSON() ?? {}), debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  if (!editor) return <Box>Loading editor...</Box>;

  return (
    <Box sx={{ border: '1px solid #e5e7eb', borderRadius: 1, bgcolor: 'white' }}>
      <Stack direction="row" spacing={0.5} sx={{ p: 1, borderBottom: '1px solid #e5e7eb' }} alignItems="center">
        <ButtonGroup size="small" variant="outlined">
          <Button
            onClick={() => editor.chain().focus().toggleBold().run()}
            sx={{ fontWeight: editor.isActive('bold') ? 700 : 400, minWidth: 36 }}
          >
            <FormatBoldIcon fontSize="small" />
          </Button>
          <Button
            onClick={() => editor.chain().focus().toggleItalic().run()}
            sx={{ fontStyle: editor.isActive('italic') ? 'italic' : 'normal', minWidth: 36 }}
          >
            <FormatItalicIcon fontSize="small" />
          </Button>
          <Button
            onClick={() => editor.chain().focus().toggleStrike().run()}
            sx={{ minWidth: 36, textDecoration: 'line-through' }}
          >
            <FormatUnderlinedIcon fontSize="small" />
          </Button>
        </ButtonGroup>
        <Divider orientation="vertical" flexItem />
        <Tooltip title="撤销">
          <IconButton size="small" onClick={() => editor.chain().focus().undo().run()}>
            <UndoIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="重做">
          <IconButton size="small" onClick={() => editor.chain().focus().redo().run()}>
            <RedoIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
      <Box sx={{ p: 2, minHeight: 240, maxHeight: 480, overflowY: 'auto' }}>
        <EditorContent editor={editor} />
      </Box>
    </Box>
  );
}
