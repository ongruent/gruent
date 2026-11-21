import Container from '@gruent/libs/frontend/components/Container'

import { Metadata } from 'next'

import styles from './page.module.css'
import { Button } from '@gruent/libs/frontend/components/core/button'
import OpenModalButton from '@gruent/libs/frontend/components/OpenModalButton'

// // do not cache this page
// export const revalidate = 1 * 60 // seconds

export const metadata: Metadata = {
  title: 'Documentation, tutorials, and API reference | Gruent',
  description:
    'Learn how to use Gruent to seamlessly integrate devices and services. Get tutorials, API reference, and more.',
  openGraph: {
    type: 'website',
    url: `https://gruent.io/docs`,
    title: 'Documentation, tutorials, and API reference | Gruent',
    description:
      'Learn how to use Gruent to seamlessly integrate devices and services. Get tutorials, API reference, and more.',
    images: ['https://gruent.io/img/logos/app-icon-primary.png'],
  },
}

const DocsPage = () => {
  return (
    <>
      <header id={styles.header} className={`${styles.dotGrid} border-b border-brand-secondary`}>
        <Container className="py-32">
          <div className={`${styles.headerContent}`}>
            <h1 className="text-2xl lg:text-4xl max-w-2xl text-brand-secondary">Documentation</h1>
            <p className="text-xl text-gray-600">Explore our guides and examples.</p>
          </div>
        </Container>
      </header>
      <div className="overflow-hidden" style={{ marginTop: '-25rem' }}>
        <div
          style={{
            marginLeft: '55rem',
            borderRight: '2000px solid rgb(23 55 24)',
            borderTop: '400px solid transparent',
          }}
        />
      </div>
      <main>
        <section className="mt-10 mb-20">
          <Container>
            <h1 className="max-w-xl">Our documentation is coming soon!</h1>
            <p className="max-w-xl">
              Once we launch our upcoming beta platform, we will have a comprehensive documentation
              section for features, tutorials, and API reference. For now, check out our{' '}
              <Button
                asChild
                variant="link"
                className="!inline h-auto px-0 py-0 text-[length:inherit] whitespace-normal"
              >
                <a href="https://discord.gg/prAJjW426d" target="_blank">
                  community Discord
                </a>
              </Button>{' '}
              or{' '}
              <OpenModalButton
                variant="link"
                modalId="betaSignup"
                className="!inline h-auto px-0 py-0 text-[length:inherit] whitespace-normal"
              >
                sign up for our upcoming launch.
              </OpenModalButton>
            </p>
          </Container>
        </section>
      </main>
    </>
  )
}

export default DocsPage
