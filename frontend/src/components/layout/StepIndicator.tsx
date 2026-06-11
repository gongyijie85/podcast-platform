import { Stepper, Step, StepLabel, Box } from '@mui/material';
import { useMobile } from '../../hooks/useMediaQuery';

const STEPS = ['选书', '配置', '生成', '预览&导出'];

export function StepIndicator({ currentStep }: { currentStep: 1 | 2 | 3 | 4 }): JSX.Element {
  const isMobile = useMobile();
  if (isMobile) {
    return (
      <Box>
        {STEPS.map((label, i) => {
          const idx = i + 1;
          const active = idx === currentStep;
          return (
            <Box
              key={label}
              sx={{
                display: 'flex',
                alignItems: 'center',
                py: 0.5,
                color: active ? 'primary.main' : 'text.secondary',
                fontWeight: active ? 600 : 400,
              }}
            >
              <Box
                sx={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  border: '2px solid',
                  borderColor: active ? 'primary.main' : 'grey.300',
                  mr: 1.5,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                }}
              >
                {active ? '●' : idx}
              </Box>
              {label}
            </Box>
          );
        })}
      </Box>
    );
  }
  return (
    <Stepper activeStep={currentStep - 1} alternativeLabel sx={{ maxWidth: 720 }}>
      {STEPS.map((label) => (
        <Step key={label}>
          <StepLabel>{label}</StepLabel>
        </Step>
      ))}
    </Stepper>
  );
}
