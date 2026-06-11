import { RadioGroup, FormControlLabel, Radio, Paper, Typography, Stack, Box } from '@mui/material';
import { useProjectStore } from '../../store/project.store';
import type { ProjectMode } from '@shared/project';

export function ModeSelector(): JSX.Element {
  const mode = useProjectStore((s) => s.mode);
  const setMode = useProjectStore((s) => s.setMode);

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={1.5}>
        <Typography variant="subtitle2" fontWeight={600}>生成模式</Typography>
        <RadioGroup
          value={mode}
          onChange={(e) => setMode(e.target.value as ProjectMode)}
        >
          <FormControlLabel
            value="independent"
            control={<Radio />}
            label={
              <Box>
                <Typography variant="body2" fontWeight={500}>逐本独立生成</Typography>
                <Typography variant="caption" color="text.secondary">
                  每本书各生成一期播客
                </Typography>
              </Box>
            }
          />
          <FormControlLabel
            value="merged"
            control={<Radio />}
            label={
              <Box>
                <Typography variant="body2" fontWeight={500}>合并为单期</Typography>
                <Typography variant="caption" color="text.secondary">
                  多本书融合到一期
                </Typography>
              </Box>
            }
          />
        </RadioGroup>
      </Stack>
    </Paper>
  );
}
