import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import FavoriteBorderOutlinedIcon from '@mui/icons-material/FavoriteBorderOutlined';
import HandymanOutlinedIcon from '@mui/icons-material/HandymanOutlined';
import HeadphonesBatteryOutlinedIcon from '@mui/icons-material/HeadphonesBatteryOutlined';
import HelpOutlineOutlinedIcon from '@mui/icons-material/HelpOutlineOutlined';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import NewReleasesOutlinedIcon from '@mui/icons-material/NewReleasesOutlined';
import NotificationsNoneOutlinedIcon from '@mui/icons-material/NotificationsNoneOutlined';
import SellOutlinedIcon from '@mui/icons-material/SellOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import {
  Box,
  Divider,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  Typography,
} from '@mui/material';
import React from 'react';

const DrawerList = () => {
  return (
    <Box sx={{ width: '100%', maxWidth: 560, bgcolor: 'Background.paper' }}>
      <nav aria-label="Drawer navigation">
        <List>
          <ListItem disablePadding>
            <ListItemButton>
              <Box display="flex" alignItems={'start'} flexDirection={'column'}>
                <ListItemIcon>
                  <AccountCircleIcon
                    sx={{ fontSize: '4rem', m: 0, ml: -1, p: 0 }}
                  />
                </ListItemIcon>
                <Box
                  display="flex"
                  width={'100%'}
                  alignItems="center"
                  justifyContent="space-between"
                  gap={4}
                >
                  <Typography variant="h5">
                    <ListItemText primary="User Name" disableTypography />
                  </Typography>
                  <ArrowForwardIosIcon fontSize="small" />
                </Box>
              </Box>
            </ListItemButton>
          </ListItem>
          <ListItem disablePadding>
            <ListItemButton>
              <ListItemIcon>
                <HomeOutlinedIcon />
              </ListItemIcon>
              <ListItemText primary="Home" />
            </ListItemButton>
          </ListItem>
          <ListItem disablePadding>
            <ListItemButton>
              <ListItemIcon>
                <NotificationsNoneOutlinedIcon />
              </ListItemIcon>
              <ListItemText primary="Notifications" />
            </ListItemButton>
          </ListItem>
        </List>
        <Divider />
        <List
          component="nav"
          aria-labelledby="nested-list-subheader"
          subheader={
            <ListSubheader
              component="div"
              id="nested-list-subheader"
              sx={{ bgcolor: 'inherit' }}
            >
              My TeckXperts
            </ListSubheader>
          }
        >
          <ListItem disablePadding>
            <ListItemButton>
              <ListItemIcon>
                <FavoriteBorderOutlinedIcon />
              </ListItemIcon>
              <ListItemText primary="Wishlist" />
            </ListItemButton>
          </ListItem>
          <ListItem disablePadding>
            <ListItemButton>
              <ListItemIcon>
                <AccountBalanceWalletOutlinedIcon />
              </ListItemIcon>
              <ListItemText primary="Purchases" />
            </ListItemButton>
          </ListItem>
          <ListItem disablePadding>
            <ListItemButton>
              <ListItemIcon>
                <SellOutlinedIcon />
              </ListItemIcon>
              <ListItemText primary="Selling" />
            </ListItemButton>
          </ListItem>
        </List>
        <Divider />
        <List>
          <ListItem disablePadding>
            <ListItemButton>
              <ListItemIcon>
                <NewReleasesOutlinedIcon />
              </ListItemIcon>
              <ListItemText primary="New" />
            </ListItemButton>
          </ListItem>
          <ListItem disablePadding>
            <ListItemButton>
              <ListItemIcon>
                <BoltOutlinedIcon />
              </ListItemIcon>
              <ListItemText primary="Deals" />
            </ListItemButton>
          </ListItem>
          <ListItem disablePadding>
            <ListItemButton>
              <ListItemIcon>
                <HeadphonesBatteryOutlinedIcon />
              </ListItemIcon>
              <ListItemText primary="Accessories" />
            </ListItemButton>
          </ListItem>
          <ListItem disablePadding>
            <ListItemButton>
              <ListItemIcon>
                <HandymanOutlinedIcon />
              </ListItemIcon>
              <ListItemText primary="Repairs" />
            </ListItemButton>
          </ListItem>
          <ListItem disablePadding>
            <ListItemButton>
              <ListItemIcon>
                <SettingsOutlinedIcon />
              </ListItemIcon>
              <ListItemText primary="Settings" />
            </ListItemButton>
          </ListItem>
          <ListItem disablePadding>
            <ListItemButton>
              <ListItemIcon>
                <HelpOutlineOutlinedIcon />
              </ListItemIcon>
              <ListItemText primary="Help & Contact" />
            </ListItemButton>
          </ListItem>
        </List>
      </nav>
    </Box>
  );
};

export default DrawerList;
