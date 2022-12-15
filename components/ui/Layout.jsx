import { Container, Divider } from '@mui/material';
import { Fragment } from 'react';
import Header from './header/Header';

const Layout = ({ children }) => {
  return (
    <Fragment>
      <Header />
      <Divider sx={{ my: 1, mb: 3 }} />
      <Container maxWidth="xl">
        <main>{children}</main>
      </Container>
      {/* <Footer /> */}
    </Fragment>
  );
};

export default Layout;
