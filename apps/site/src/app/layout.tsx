import Navbar from '@gruent/libs/frontend/components/Navbar'
import Footer from '@gruent/libs/frontend/components/Footer'

import './styles.css'
import Providers from './Providers'
import BetaSignupModal from '@gruent/libs/frontend/components/Modal/BetaSignupModal'
import MobileNavModal from '@gruent/libs/frontend/components/Modal/MobileNavModal'

const RootLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <html>
      <head />
      <body>
        <Providers>
          <div className="flex flex-col min-h-screen">
            <BetaSignupModal />
            <MobileNavModal />
            <Navbar />
            <div className="grow">{children}</div>
            <Footer />
          </div>
        </Providers>
      </body>
    </html>
  )
}

export default RootLayout
