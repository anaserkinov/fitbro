import { useEffect, useState } from 'react';
import { call } from './lib/api.js';
import { UserProvider, NavProvider, useNav, useUser } from './lib/app-state.jsx';
import { Icon } from './ui/icons.jsx';
import { Spinner, ErrorBox, ToastHost } from './ui/kit.jsx';
import { haptic } from './lib/tg.js';
import { t } from './lib/i18n.js';

import Onboarding from './screens/Onboarding.jsx';
import Home from './screens/Home.jsx';
import Train from './screens/Train.jsx';
import Food from './screens/Food.jsx';
import Progress from './screens/Progress.jsx';
import Body from './screens/Body.jsx';
import Workout from './screens/Workout.jsx';
import WorkoutSummary from './screens/WorkoutSummary.jsx';
import FoodSearch from './screens/FoodSearch.jsx';
import FoodEditor from './screens/FoodEditor.jsx';
import RecipeEditor from './screens/RecipeEditor.jsx';
import RoutineEditor from './screens/RoutineEditor.jsx';
import ExerciseDetail from './screens/ExerciseDetail.jsx';
import ExerciseEditor from './screens/ExerciseEditor.jsx';
import History from './screens/History.jsx';
import Settings from './screens/Settings.jsx';

const TABS = [
  { id: 'home', label: 'Today', icon: 'home', Screen: Home },
  { id: 'train', label: 'Train', icon: 'dumbbell', Screen: Train },
  { id: 'food', label: 'Food', icon: 'food', Screen: Food },
  { id: 'progress', label: 'Progress', icon: 'trend', Screen: Progress },
  { id: 'body', label: 'Body', icon: 'user', Screen: Body },
];

const SCREENS = {
  Workout, WorkoutSummary, FoodSearch, FoodEditor, RecipeEditor, RoutineEditor,
  ExerciseDetail, ExerciseEditor, History, Settings, ProfileEdit: Onboarding,
};

function TabBar() {
  const nav = useNav();
  return (
    <nav className="tabbar" aria-label={t('Main')}>
      {TABS.map((tab) => {
        const active = nav.tab === tab.id;
        return (
          <button key={tab.id} type="button" aria-current={active ? 'page' : undefined}
            onClick={() => { if (!active) haptic.select(); nav.setTab(tab.id); }}>
            <Icon name={tab.icon} size={26} stroke={active ? 2.3 : 1.8} />
            {t(tab.label)}
          </button>
        );
      })}
    </nav>
  );
}

function Shell() {
  const nav = useNav();
  if (nav.top) {
    const Screen = SCREENS[nav.top.screen];
    return (
      <div key={nav.top.key}>
        {nav.showDevBack && (
          <div style={{ padding: '8px 16px 0', maxWidth: 640, margin: '0 auto' }}>
            <button type="button" className="devbar" onClick={nav.pop}><Icon name="chevronLeft" size={20} stroke={2.4} />{t('Go back')}</button>
          </div>
        )}
        <Screen {...nav.top.params} />
      </div>
    );
  }
  const { Screen } = TABS.find((t) => t.id === nav.tab);
  return (
    <>
      <Screen key={nav.tab} />
      <TabBar />
    </>
  );
}

function Signed() {
  const { user } = useUser();
  if (!user.onboardedAt) return <Onboarding />;
  return <NavProvider><Shell /></NavProvider>;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [error, setError] = useState(null);
  const load = () => {
    setError(null);
    call('getMe').then((me) => setUser(me.user), setError);
  };
  useEffect(load, []);

  return (
    <>
      <ToastHost />
      {user ? (
        <UserProvider user={user} setUser={setUser}><Signed /></UserProvider>
      ) : error ? (
        <div className="screen sub"><ErrorBox error={error} onRetry={load} /></div>
      ) : (
        <Spinner />
      )}
    </>
  );
}
