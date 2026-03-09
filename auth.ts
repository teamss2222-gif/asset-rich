import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

const demoUser = process.env.DEMO_USER ?? "admin";
const demoPass = process.env.DEMO_PASS ?? "changeme";

const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  callbacks: {
    authorized: ({ auth }) => Boolean(auth?.user),
  },
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const username = credentials?.username?.toString() ?? "";
        const password = credentials?.password?.toString() ?? "";

        if (username === demoUser && password === demoPass) {
          return {
            id: "demo-user",
            name: "Demo User",
            email: "demo@local",
          };
        }

        return null;
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
});

export { handlers, auth, signIn, signOut };
