import AimTrainer from "./components/AimTrainer";
import FeedbackPanel from "./components/FeedbackPanel";
import SplashLoader from "./components/SplashLoader";

export default function Home() {
  return (
    <SplashLoader>
      <AimTrainer />
      <FeedbackPanel />
    </SplashLoader>
  );
}
