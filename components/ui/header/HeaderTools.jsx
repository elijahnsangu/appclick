import { useTheme } from '@emotion/react';
import { Logout, Settings } from '@mui/icons-material';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import MenuIcon from '@mui/icons-material/Menu';
import NotificationsOutlinedIcon from '@mui/icons-material/NotificationsOutlined';
import ShoppingBagOutlinedIcon from '@mui/icons-material/ShoppingBagOutlined';
import {
  Avatar,
  Box,
  Divider,
  IconButton,
  ListItemIcon,
  Menu,
  MenuItem,
  Stack,
  SwipeableDrawer,
  Tooltip,
  useMediaQuery,
} from '@mui/material';
import React, { Fragment, useContext, useState } from 'react';
import { ColorModeContext } from '../../../src/theme';
import DrawerList from '../DrawerList';

const HeaderTools = () => {
  const theme = useTheme();
  const colorMode = useContext(ColorModeContext);
  const matchesMd = useMediaQuery((theme) => theme.breakpoints.down('md'));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const iOS =
    typeof navigator !== 'undefined' &&
    /iPad|iPhone|iPod/.test(navigator.userAgent);

  //menu config

  const [anchorEl, setAnchorEl] = useState(null);
  const open = Boolean(anchorEl);
  const handleClick = (event) => {
    setAnchorEl(event.currentTarget);
  };
  const handleClose = () => {
    setAnchorEl(null);
  };

  const drawer = (
    <Fragment>
      <SwipeableDrawer
        open={drawerOpen}
        onOpen={() => setDrawerOpen(true)}
        onClose={() => setDrawerOpen(false)}
        disableBackdropTransition={!iOS}
        disableDiscovery={iOS}
      >
        <DrawerList />
      </SwipeableDrawer>
    </Fragment>
  );

  const menu = (
    <Fragment>
      <Menu
        anchorEl={anchorEl}
        id="account-menu"
        open={open}
        onClose={handleClose}
        onClick={handleClose}
        PaperProps={{
          elevation: 0,
          sx: {
            overflow: 'visible',
            filter: 'drop-shadow(0px 2px 8px rgba(0,0,0,0.32))',
            mt: 1.5,
            '& .MuiAvatar-root': {
              width: 32,
              height: 32,
              ml: -0.5,
              mr: 1,
            },
            '&:before': {
              content: '""',
              display: 'block',
              position: 'absolute',
              top: 0,
              right: 14,
              width: 10,
              height: 10,
              bgcolor: 'background.paper',
              transform: 'translateY(-50%) rotate(45deg)',
              zIndex: 0,
            },
          },
        }}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      >
        <MenuItem>
          <Avatar /> Profile
        </MenuItem>
        <MenuItem>
          <Avatar /> My account
        </MenuItem>
        <Divider />
        <MenuItem>
          <ListItemIcon>
            <Settings fontSize="small" />
          </ListItemIcon>
          Settings
        </MenuItem>
        <MenuItem>
          <ListItemIcon>
            <Logout fontSize="small" />
          </ListItemIcon>
          Logout
        </MenuItem>
      </Menu>
    </Fragment>
  );

  return (
    <Box display="flex" alignItems="center">
      <Stack>
        <IconButton onClick={() => colorMode.toggleColorMode()}>
          {theme.palette.mode === 'dark' ? (
            <DarkModeOutlinedIcon />
          ) : (
            <LightModeOutlinedIcon />
          )}
        </IconButton>
        <IconButton sx={{ display: { md: 'flex', sm: 'none', xs: 'none' } }}>
          <NotificationsOutlinedIcon />
        </IconButton>
        <IconButton>
          <ShoppingBagOutlinedIcon />
        </IconButton>
      </Stack>
      {matchesMd ? (
        <IconButton
          sx={{
            borderRadius: 10,
            border: '1px solid',
            borderColor: theme.palette.primary.main,
            ml: 1,
            display: { md: 'flex' },
          }}
          onClick={() => setDrawerOpen(true)}
        >
          <Stack direction={'row'}>
            <MenuIcon />
          </Stack>
        </IconButton>
      ) : (
        <Tooltip title="Account settings">
          <IconButton
            sx={{
              borderRadius: 10,
              border: '1px solid',
              borderColor: theme.palette.primary.main,
              ml: 2,
              display: { md: 'flex', sm: 'none', xs: 'none' },
            }}
            onClick={handleClick}
            aria-controls={open ? 'account-menu' : undefined}
            aria-haspopup="true"
            aria-expanded={open ? 'true' : undefined}
          >
            <Stack>
              <MenuIcon />
              <AccountCircleIcon />
            </Stack>
          </IconButton>
        </Tooltip>
      )}
      {menu}
      {drawer}
    </Box>
  );
};

export default HeaderTools;
