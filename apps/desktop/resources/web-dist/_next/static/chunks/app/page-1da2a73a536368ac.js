(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
  [931],
  {
    5303: function (e, n, t) {
      Promise.resolve().then(t.bind(t, 1403));
    },
    1403: function (e, n, t) {
      'use strict';
      (t.r(n),
        t.d(n, {
          default: function () {
            return a;
          },
        }));
      var r = t(7573),
        s = t(7653),
        i = t(1695),
        u = t(4175);
      function a() {
        let e = (0, i.useRouter)(),
          { isAuthenticated: n, isLoading: t } = (0, u.aC)();
        return (
          (0, s.useEffect)(() => {
            t || (n ? e.push('/keimenon') : e.push('/login'));
          }, [n, t, e]),
          (0, r.jsx)('div', {
            className:
              'min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900',
            children: (0, r.jsxs)('div', {
              className: 'text-center',
              children: [
                (0, r.jsx)('div', {
                  className:
                    'w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto',
                }),
                (0, r.jsx)('p', { className: 'mt-4 text-slate-400', children: 'Loading...' }),
              ],
            }),
          })
        );
      }
    },
  },
  function (e) {
    (e.O(0, [44, 898, 195, 630, 293, 528, 744], function () {
      return e((e.s = 5303));
    }),
      (_N_E = e.O()));
  },
]);
