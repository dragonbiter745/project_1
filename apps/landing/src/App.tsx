import { Hero } from './ui/hero/Hero';
import { FinalCta } from './ui/story/FinalCta';
import { Footer } from './ui/story/Footer';
import { Kitchens } from './ui/story/Kitchens';
import { Managers } from './ui/story/Managers';
import { Nav } from './ui/story/Nav';
import { Numbers } from './ui/story/Numbers';
import { CursorGlow, ScrollProgress } from './ui/story/ScrollFx';
import { ShopsMarquee } from './ui/story/ShopsMarquee';
import { Split } from './ui/story/Split';
import { Story } from './ui/story/Story';

export default function App() {
  return (
    <>
      <a href="#story" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-full focus:bg-white focus:px-4 focus:py-2">
        Skip to content
      </a>
      <ScrollProgress />
      <CursorGlow />
      <Nav />
      <main>
        <Hero />
        <Story />
        <Split />
        <Kitchens />
        <Managers />
        <Numbers />
        <ShopsMarquee />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
