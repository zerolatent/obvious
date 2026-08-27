import { Text, View } from "react-native"

export default function MobileHomeScreen() {
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <Text style={{ fontSize: 24, fontWeight: "600", marginBottom: 12 }}>Obvious Auth</Text>
      <Text style={{ textAlign: "center" }}>
        Expo mobile shell for the pluggable signup and login system.
      </Text>
    </View>
  )
}
