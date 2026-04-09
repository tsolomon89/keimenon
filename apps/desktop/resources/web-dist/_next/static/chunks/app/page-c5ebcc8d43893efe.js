(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
  [931],
  {
    5303: function (e, t, n) {
      Promise.resolve().then(n.bind(n, 1403));
    },
    1403: function (e, t, n) {
      'use strict';
      (n.r(t),
        n.d(t, {
          default: function () {
            return o;
          },
        }));
      var r = n(7573),
        s = n(7653),
        a = n(1695),
        i = n(4175);
      function o() {
        let e = (0, a.useRouter)(),
          { isAuthenticated: t, isLoading: n } = (0, i.aC)();
        return (
          (0, s.useEffect)(() => {
            if (n) return;
            let r = new URLSearchParams(window.location.search),
              s = new URLSearchParams();
            for (let e of ['apiPort', 'dev']) {
              let t = r.get(e);
              t && s.set(e, t);
            }
            let a = s.toString();
            t
              ? e.push(a ? '/keimenon?'.concat(a) : '/keimenon')
              : e.push(a ? '/login?'.concat(a) : '/login');
          }, [t, n, e]),
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
    (e.O(0, [898, 642, 630, 293, 528, 744], function () {
      return e((e.s = 5303));
    }),
      (_N_E = e.O()));
  },
]);
