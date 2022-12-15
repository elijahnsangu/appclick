import { Typography } from '@mui/material';
import Box from '@mui/material/Box';
import React from 'react';
import { GiAlliedStar } from 'react-icons/gi';

const Logo = () => {
  // const theme = useTheme();

  return (
    <Box display="flex" alignItems="center">
      <GiAlliedStar fontSize={'2.3rem'} />
      <Typography
        variant="h3"
        sx={{
          ml: 1,
          //   fontSize: '2rem',
          fontWeight: 700,
        }}
      >
        Teck_xperts
      </Typography>
    </Box>
  );
};

export default Logo;
