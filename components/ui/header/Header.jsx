import { AppBar, Toolbar } from '@mui/material';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import React from 'react';
import HeaderTools from './HeaderTools';
import Logo from './Logo';

const Header = () => {
  // const theme = useTheme();
  // const colors = tokens(theme.palette.mode);
  return (
    <AppBar position="static" color="transparent" elevation={0}>
      <Toolbar disableGutters sx={{ mt: 1 }}>
        <Container maxWidth="xl">
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              py: 1,
            }}
          >
            <Logo />
            <HeaderTools />
          </Box>
        </Container>
      </Toolbar>
    </AppBar>
  );
};

export default Header;
