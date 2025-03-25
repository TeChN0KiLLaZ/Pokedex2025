import React, { useEffect, useState, useCallback } from "react";
import { View, Text, Image, TouchableOpacity, ActivityIndicator, StyleSheet, FlatList, Dimensions } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { findBackgroundColor } from "./(tabs)/index";
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/Colors'; // Import as named export, not default

type EvolutionDetails = {
  level?: number;
  item?: string;
  trigger?: string;
};

type EvolutionChain = {
  name: string;
  url: string;
  id: string;
  evolutionDetails?: EvolutionDetails;
  types?: Array<{ type: { name: string } }>;
};

type EvolutionChainLink = {
  species: { name: string; url: string };
  evolves_to: EvolutionChainLink[];
  evolution_details?: Array<{
    min_level?: number;
    item?: { name: string };
    trigger?: { name: string };
  }>;
};

type EvolutionChainResponse = { chain: EvolutionChainLink };

function getEvolutionMethod(evolution: EvolutionChain) {
  if (!evolution.evolutionDetails) return "";
  if (evolution.evolutionDetails.level) return `Level ${evolution.evolutionDetails.level}`;
  if (evolution.evolutionDetails.item) return `Use ${evolution.evolutionDetails.item}`;
  return "Special";
}

export default function Evolution() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [evolutionData, setEvolutionData] = useState<EvolutionChain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const colorScheme = useColorScheme() ?? 'light';
  const themeColor = Colors[colorScheme].tint;

  const parseEvolutionChain = useCallback((chain: EvolutionChainLink, details?: any): EvolutionChain[] => {
    const results: EvolutionChain[] = [];

    // Helper to extract ID from URL
    const getId = (url: string) => {
      const parts = url.split("/");
      return parts[parts.length - 2];
    };

    // Base form
    const baseId = getId(chain.species.url);
    results.push({
      name: chain.species.name,
      id: baseId,
      url: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${baseId}.png`,
      evolutionDetails: details || undefined,
    });

    // Recursively add evolutions
    if (chain.evolves_to && chain.evolves_to.length > 0) {
      for (const evolution of chain.evolves_to) {
        const evoDetails = evolution.evolution_details?.[0] || {};
        results.push(
          ...parseEvolutionChain(evolution, {
            level: evoDetails.min_level,
            item: evoDetails.item?.name,
            trigger: evoDetails.trigger?.name,
          })
        );
      }
    }

    return results;
  }, []);

  const fetchEvolutionData = useCallback(async () => {
    if (!id) {
      setError("No Pokémon ID provided");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // Species data
      const speciesResponse = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${id}`);
      if (!speciesResponse.ok) {
        throw new Error(`Failed to get species data (${speciesResponse.status})`);
      }
      const speciesData = await speciesResponse.json();

      // Evolution chain data
      const evolutionResponse = await fetch(speciesData.evolution_chain.url);
      if (!evolutionResponse.ok) {
        throw new Error(`Failed to get evolution data (${evolutionResponse.status})`);
      }
      const evolutionData: EvolutionChainResponse = await evolutionResponse.json();

      // Parse chain
      const evolutions = parseEvolutionChain(evolutionData.chain);

      // Fetch types
      const evolutionsWithTypes = await Promise.all(
        evolutions.map(async (evo) => {
          try {
            const pokemonResponse = await fetch(`https://pokeapi.co/api/v2/pokemon/${evo.id}`);
            const pokemonData = await pokemonResponse.json();
            return { ...evo, types: pokemonData.types };
          } catch (error) {
            console.error(`Error fetching types for ${evo.name}:`, error);
            return evo;
          }
        })
      );

      setEvolutionData(evolutionsWithTypes);
    } catch (error) {
      console.error("Error fetching evolution data:", error);
      setError(error instanceof Error ? error.message : "Failed to load evolution data");
    } finally {
      setLoading(false);
    }
  }, [id, parseEvolutionChain]);

  useEffect(() => {
    fetchEvolutionData();
  }, [fetchEvolutionData]);

  const navigateToAbout = (pokemonId: string) => {
    router.push({ pathname: "/about", params: { query: pokemonId } });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF5350" />
        <Text style={styles.loadingText}>Loading evolution data...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorTitle}>Oops! Something went wrong</Text>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity 
          onPress={fetchEvolutionData} 
          style={[styles.retryButton, {backgroundColor: themeColor || "#FF5350"}]}
          activeOpacity={0.7}
        >
          <Text style={styles.retryText}>Try Again</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          onPress={() => router.back()} 
          style={styles.backButton}
        >
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!evolutionData.length) {
    return (
      <View style={styles.noEvolutionContainer}>
        <Text style={styles.noEvolutionText}>This Pokémon does not evolve</Text>
        <TouchableOpacity 
          onPress={() => router.back()} 
          style={styles.backButton}
        >
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Evolution Chain</Text>
      <FlatList
        data={evolutionData}
        horizontal
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <View style={styles.evolutionItem}>
            <TouchableOpacity
              style={[
                styles.pokemonContainer,
                id === item.id && styles.highlight,
                { borderColor: findBackgroundColor(item.types?.[0]?.type?.name || "normal") },
              ]}
              onPress={() => navigateToAbout(item.id)}
            >
              <Image source={{ uri: item.url }} style={styles.image} />
              <Text style={styles.pokemonName}>{item.name}</Text>
              <Text style={styles.evolutionLevel}>{getEvolutionMethod(item)}</Text>
            </TouchableOpacity>
            {index < evolutionData.length - 1 && (
              <View style={styles.arrowContainer}>
                <View style={[
                  styles.arrowBox, 
                  { backgroundColor: item.types && item.types[0] ? 
                    findBackgroundColor(item.types[0].type.name) : 
                    themeColor || "#FF5350" 
                  }
                ]}>
                  <Text style={styles.arrow}>→</Text>
                </View>
                {item.evolutionDetails && (
                  <Text style={styles.evolutionMethod}>
                    {getEvolutionMethod(item)}
                  </Text>
                )}
              </View>
            )}
          </View>
        )}
      />
    </View>
  );
}

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fafafa",
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    fontSize: 26,
    fontWeight: "900",
    marginBottom: 20,
    letterSpacing: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fafafa",
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    fontStyle: "italic",
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
    backgroundColor: "#fafafa",
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 10,
    color: "#333",
  },
  errorText: {
    fontSize: 16,
    color: "#666",
    marginBottom: 25,
    textAlign: "center",
    maxWidth: width * 0.8,
  },
  retryButton: {
    paddingVertical: 12,
    paddingHorizontal: 30,
    backgroundColor: "#FF5350",
    borderRadius: 25,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  retryText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
  },
  backButton: {
    marginTop: 15,
    paddingVertical: 10,
  },
  backButtonText: {
    color: "#666",
    fontSize: 14,
  },
  noEvolutionContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fafafa",
    padding: 20,
  },
  noEvolutionText: {
    fontSize: 18,
    color: "#666",
    textAlign: "center",
    marginBottom: 20,
  },
  evolutionItem: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 4,
  },
  pokemonContainer: {
    alignItems: "center",
    backgroundColor: "white",
    borderRadius: 8,
    padding: 8,
    borderWidth: 2,
    marginHorizontal: 3,
    minWidth: 80,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  highlight: {
    backgroundColor: "#FFF176",
  },
  image: {
    width: 50,
    height: 50,
    marginBottom: 3,
  },
  pokemonName: {
    fontSize: 14,
    textTransform: "capitalize",
    marginTop: 3,
    fontWeight: "bold",
  },
  evolutionLevel: {
    fontSize: 12,
    color: "#333",
    marginTop: 2,
    fontStyle: "italic",
  },
  arrowContainer: {
    marginHorizontal: 6,
    alignItems: "center",
  },
  arrowBox: {
    backgroundColor: "#FF5350",
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.5,
    elevation: 2,
  },
  arrow: {
    fontSize: 18,
    fontWeight: "bold",
    color: "white",
  },
  evolutionMethod: {
    fontSize: 10,
    color: "#666",
    marginTop: 3,
    textAlign: "center",
    maxWidth: 70,
  }
});
