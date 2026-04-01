(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
  [805],
  {
    7635: function (e, t, n) {
      Promise.resolve().then(n.bind(n, 889));
    },
    889: function (e, t, n) {
      'use strict';
      (n.r(t),
        n.d(t, {
          default: function () {
            return l;
          },
        }));
      var r = n(7573),
        s = n(7653),
        i = n(1695),
        u = n(4175);
      function l() {
        let e = (0, i.useRouter)(),
          { logout: t, isAuthenticated: n } = (0, u.aC)();
        return (
          (0, s.useEffect)(() => {
            n ? t() : e.push('/login');
          }, [n, t, e]),
          (0, r.jsx)('div', {
            className:
              'min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900',
            children: (0, r.jsxs)('div', {
              className: 'text-center',
              children: [
                (0, r.jsx)('div', {
                  className:
                    'inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500 mb-4',
                }),
                (0, r.jsx)('p', { className: 'text-white text-lg', children: 'Logging out...' }),
              ],
            }),
          })
        );
      }
    },
  },
  function (e) {
    (e.O(0, [44, 898, 195, 630, 293, 528, 744], function () {
      return e((e.s = 7635));
    }),
      (_N_E = e.O()));
  },
]);
