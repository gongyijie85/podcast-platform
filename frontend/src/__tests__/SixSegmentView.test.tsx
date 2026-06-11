import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { SixSegmentView, type SixSegmentItem } from '../components/script/SixSegmentView';

const theme = createTheme();

const baseItems: SixSegmentItem[] = [
  { id: 'a', speaker: 'host', text: '欢迎收听', emotion: '平缓', stage: 'intro' },
  { id: 'b', speaker: 'guest', text: '感谢邀请', emotion: '平缓', stage: 'intro' },
  { id: 'c', speaker: 'host', text: '今天聊聊', emotion: '激昂', stage: 'introduce' },
];

describe('<SixSegmentView />', () => {
  it('renders all six stage headers', () => {
    render(
      <ThemeProvider theme={theme}>
        <SixSegmentView value={baseItems} onChange={() => {}} />
      </ThemeProvider>,
    );
    expect(screen.getByText('① 开头')).toBeInTheDocument();
    expect(screen.getByText('② 发展')).toBeInTheDocument();
    expect(screen.getByText('③ 高潮')).toBeInTheDocument();
    expect(screen.getByText('④ 转折')).toBeInTheDocument();
    expect(screen.getByText('⑤ 结局')).toBeInTheDocument();
    expect(screen.getByText('⑥ 结尾')).toBeInTheDocument();
  });

  it('groups items by stage', () => {
    render(
      <ThemeProvider theme={theme}>
        <SixSegmentView value={baseItems} onChange={() => {}} />
      </ThemeProvider>,
    );
    // intro has 2 items, introduce has 1
    expect(screen.getByText('欢迎收听')).toBeInTheDocument();
    expect(screen.getByText('感谢邀请')).toBeInTheDocument();
    expect(screen.getByText('今天聊聊')).toBeInTheDocument();
  });

  it('shows a footer summary with counts', () => {
    render(
      <ThemeProvider theme={theme}>
        <SixSegmentView value={baseItems} onChange={() => {}} />
      </ThemeProvider>,
    );
    expect(screen.getByText(/3 段/)).toBeInTheDocument();
    expect(screen.getByText(/3 已写/)).toBeInTheDocument();
    expect(screen.getByText(/2 主持人 \/ 1 嘉宾/)).toBeInTheDocument();
  });

  it('shows empty-state hint for a stage with no items', () => {
    render(
      <ThemeProvider theme={theme}>
        <SixSegmentView value={baseItems} onChange={() => {}} />
      </ThemeProvider>,
    );
    // Stages ③④⑤⑥ are empty
    const emptyHints = screen.getAllByText('还没有台词，点击右上角添加。');
    expect(emptyHints.length).toBe(4);
  });

  it('adds a host item when "主持人" button is clicked', () => {
    const onChange = vi.fn();
    render(
      <ThemeProvider theme={theme}>
        <SixSegmentView value={[]} onChange={onChange} />
      </ThemeProvider>,
    );
    const hostButtons = screen.getAllByText('主持人');
    // Click the first "主持人" button (in the intro stage header)
    fireEvent.click(hostButtons[0]);
    expect(onChange).toHaveBeenCalledTimes(1);
    const newValue = onChange.mock.calls[0][0];
    expect(newValue).toHaveLength(1);
    expect(newValue[0]).toMatchObject({
      speaker: 'host',
      stage: 'intro',
      text: '',
      emotion: '平缓',
    });
    expect(typeof newValue[0].id).toBe('string');
  });

  it('adds a guest item when "嘉宾" button is clicked', () => {
    const onChange = vi.fn();
    render(
      <ThemeProvider theme={theme}>
        <SixSegmentView value={[]} onChange={onChange} />
      </ThemeProvider>,
    );
    const guestButtons = screen.getAllByText('嘉宾');
    fireEvent.click(guestButtons[2]); // ③ 高潮 stage
    const newValue = onChange.mock.calls[0][0];
    expect(newValue[0]).toMatchObject({ speaker: 'guest', stage: 'interpret' });
  });

  it('removes an item when the delete button is clicked', () => {
    const onChange = vi.fn();
    render(
      <ThemeProvider theme={theme}>
        <SixSegmentView value={baseItems} onChange={onChange} />
      </ThemeProvider>,
    );
    const deleteButtons = screen.getAllByLabelText('delete');
    fireEvent.click(deleteButtons[0]);
    const newValue = onChange.mock.calls[0][0];
    expect(newValue).toHaveLength(2);
    // The removed item is the first one (id 'a')
    expect(newValue.find((i: SixSegmentItem) => i.id === 'a')).toBeUndefined();
  });

  it('updates text when a textarea is edited', () => {
    const onChange = vi.fn();
    render(
      <ThemeProvider theme={theme}>
        <SixSegmentView value={baseItems} onChange={onChange} />
      </ThemeProvider>,
    );
    const textboxes = screen.getAllByLabelText('segment text');
    fireEvent.change(textboxes[0], { target: { value: 'updated text' } });
    const newValue = onChange.mock.calls[0][0];
    const updated = newValue.find((i: SixSegmentItem) => i.id === 'a');
    expect(updated.text).toBe('updated text');
  });

  it('moves an item up when "move up" is clicked', () => {
    const onChange = vi.fn();
    render(
      <ThemeProvider theme={theme}>
        <SixSegmentView value={baseItems} onChange={onChange} />
      </ThemeProvider>,
    );
    const upButtons = screen.getAllByLabelText('move up');
    // Click "move up" on the second item (b)
    fireEvent.click(upButtons[1]);
    const newValue = onChange.mock.calls[0][0];
    expect(newValue[0].id).toBe('b');
    expect(newValue[1].id).toBe('a');
  });

  it('moves an item down when "move down" is clicked', () => {
    const onChange = vi.fn();
    render(
      <ThemeProvider theme={theme}>
        <SixSegmentView value={baseItems} onChange={onChange} />
      </ThemeProvider>,
    );
    const downButtons = screen.getAllByLabelText('move down');
    fireEvent.click(downButtons[0]);
    const newValue = onChange.mock.calls[0][0];
    expect(newValue[0].id).toBe('b');
    expect(newValue[1].id).toBe('a');
  });

  it('does not render add/remove/move controls in readOnly mode', () => {
    render(
      <ThemeProvider theme={theme}>
        <SixSegmentView value={baseItems} onChange={() => {}} readOnly />
      </ThemeProvider>,
    );
    expect(screen.queryAllByLabelText('delete')).toHaveLength(0);
    expect(screen.queryAllByLabelText('move up')).toHaveLength(0);
    expect(screen.queryAllByLabelText('move down')).toHaveLength(0);
    // The "主持人" / "嘉宾" labels in the speaker chips (per-row) ARE still rendered;
    // but the "Add host/guest" buttons in the headers (which also say 主持人 / 嘉宾)
    // are NOT rendered. We assert by counting: with 3 items there should be exactly
    // 3 主持人/嘉宾 chips and 0 add-buttons (which would add 12 more in writable mode).
    const speakerChips = screen.getAllByText(/^(主持人|嘉宾)$/);
    expect(speakerChips).toHaveLength(3);
  });

  it('disables text input in readOnly mode', () => {
    render(
      <ThemeProvider theme={theme}>
        <SixSegmentView value={baseItems} onChange={() => {}} readOnly />
      </ThemeProvider>,
    );
    const textboxes = screen.getAllByLabelText('segment text');
    textboxes.forEach((tb) => {
      expect(tb).toBeDisabled();
    });
  });

  it('does not crash when an unknown emotion is passed (runtime fallback)', () => {
    // The shared type `ScriptEmotion` only allows the 8 whitelisted strings,
    // but the LLM behind script generation may occasionally invent a new
    // one (e.g. '兴奋'). `SixSegmentView` should fall back gracefully
    // (no MUI Select warning, no thrown error) and still render the row.
    const itemsWithUnknown: SixSegmentItem[] = [
      { id: 'x', speaker: 'host', text: '一段台词', emotion: '兴奋' as unknown as SixSegmentItem['emotion'], stage: 'intro' },
    ];
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      render(
        <ThemeProvider theme={theme}>
          <SixSegmentView value={itemsWithUnknown} onChange={() => {}} />
        </ThemeProvider>,
      );
      // The row still renders (text input is present).
      expect(screen.getByLabelText('segment text')).toBeInTheDocument();
      // MUI Select should not complain about a value-not-in-MenuItem-list warning.
      const selectWarn = warn.mock.calls.some((c) =>
        c.some((arg) => typeof arg === 'string' && /MuiSelect.*not in the menu item list|out of range/i.test(arg)),
      );
      expect(selectWarn).toBe(false);
    } finally {
      warn.mockRestore();
    }
  });
});
